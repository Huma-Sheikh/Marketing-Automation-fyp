"""
=============================================================================
  LLM SALES BRAIN — QLoRA fine-tune → merge → GGUF q4_K_M
  Marketing Automation FYP — Google Colab Free Tier (T4 GPU), ONE CELL
=============================================================================

HOW TO RUN
  1. Colab → Runtime → Change runtime type → T4 GPU  (required, 4-bit needs CUDA)
  2. Paste this ENTIRE file into ONE Colab cell and run it.
     No pip requirements file, no second cell, no manual dataset download.
  3. Optional secrets (Colab left sidebar → 🔑 Secrets, "Notebook access" ON):
        HF_TOKEN      — only needed for gated models / private HF datasets
        GITHUB_TOKEN  — only needed to pull your own private-repo training data
     Missing secrets are not fatal: the script skips those sources and continues.

WHAT IT PRODUCES
  models/llm/model-q4_K_M.gguf   ← the file python-services/llm-service/ loads
  models/llm/llm_service_main.py ← drop-in upgraded FastAPI service (same API)
  models/llm/merged-fp16/        ← full-precision merged model (re-quantize later)
  Everything is also copied to Google Drive if you mount it, so a disconnect
  does not cost you the run.

WHY THIS BASE MODEL
  The NestJS AiService calls POST /chat with an 8-second axios timeout during a
  LIVE voice call (nestjs-backend/src/ai/ai.service.ts), and llm-service runs
  llama.cpp on CPU with n_threads=4. So the real constraint is CPU tokens/sec,
  not benchmark scores. Presets:

  ┌──────────┬──────────────────────────┬────────────────────────────────────┐
  │ PRESET   │ Base model               │ Relative cost                      │
  ├──────────┼──────────────────────────┼────────────────────────────────────┤
  │ fast ★   │ Qwen2.5-1.5B-Instruct    │ 1×   (fastest train + inference)   │
  │ balanced │ Qwen2.5-3B-Instruct      │ ~2×  params → roughly 2× slower    │
  │ quality  │ Meta-Llama-3.1-8B-Instr. │ ~5×  params; gated; Colab Pro only │
  └──────────┴──────────────────────────┴────────────────────────────────────┘
  ★ = default. CPU generation speed scales roughly inversely with parameter
  count, and /chat must finish 150 tokens inside the 8s timeout on 4 threads —
  the smallest model gives the most headroom. Qwen2.5 is ungated.

  NO SPEED FIGURE IN THIS HEADER IS A MEASUREMENT. Real CPU tok/s depends on the
  host CPU, so SECTION 8 benchmarks the finished GGUF and prints the measured
  tok/s and the implied /chat latency. Trust that output, not an estimate.

IF A SESSION CRASHES OR YOUR LAPTOP DIES
  Mount Drive (MOUNT_DRIVE=True, default) and just re-run the cell. A checkpoint
  is written to Drive 4 times per epoch (and when the time budget stops training),
  and a re-run RESUMES from the newest one. Training stops at
  TRAIN_TIME_BUDGET_MIN (45 by default) and proceeds to merge + quantise anyway,
  so a session that survives that long ends with a GGUF. Delete the Drive folder
  `checkpoints-<preset>/` to start over. A crash BEFORE the first checkpoint, or
  with Drive unmounted, still loses the run.

  If training COMPLETED but a later stage failed, set SKIP_TRAINING=True and
  re-run: it skips datasets and training entirely, picks up the adapter already
  mirrored to Drive, and goes straight to merge → GGUF → benchmark (~10 min, no
  training GPU time). The adapter is mirrored the moment training ends, before
  the merge and GGUF stages, precisely so that a failure there costs minutes.

  A NOTE ON torchao: Colab preinstalls torchao 0.10, and peft's
  is_torchao_available() RAISES on any version below 0.16 instead of returning
  False. It surfaces only at MERGE time — peft's bnb dispatcher claims 4-bit
  layers during training and never reaches the torchao one, but the fp16 merge
  base falls through to it. SECTION 0 uninstalls the stale copy (nothing here
  uses torchao) rather than upgrading it, since a newer torchao can pull a torch
  that breaks Colab's CUDA pairing.

  A NOTE ON bf16: this script forces float16 on any GPU below compute capability
  8.0. torch.cuda.is_bf16_supported() returned True on a T4 in a real run of an
  earlier version of this file (it counts software emulation), and that run
  trained at ~59 s/step with a 9-hour ETA. Pre-Ampere GPUs have no native bf16
  kernels, so that is the most likely cause. After 25 steps SECTION 5 prints the
  measured s/step, so you can confirm the speedup within minutes.

TWO TASKS ARE TRAINED INTO ONE MODEL
  task=chat     → next sales-agent turn, ≤2 sentences, asks a qualifying question
  task=qualify  → strict JSON {"outcome","score","notes"} matching the exact
                  enum llm-service/main.py already returns, so nothing downstream
                  (calling.gateway, leads scoring, analytics) has to change.

DATASETS (auto-downloaded — HuggingFace + optional GitHub + synthetic)
  ┌──────────────────────────────────────────┬─────────┬─────────────────────┐
  │ Source                                   │ Cap     │ What it teaches     │
  ├──────────────────────────────────────────┼─────────┼─────────────────────┤
  │ goendalf666/sales-conversations          │  6,000  │ Core B2B sales turns│
  │ goendalf666/sales-conversations-2        │  3,000  │ More sales dialogue │
  │ bitext/Bitext-customer-support-...       │  4,000  │ Polite service tone │
  │ MohammadOthman/mo-customer-support-...   │  3,000  │ Short real replies  │
  │ HuggingFaceH4/no_robots                  │  2,000  │ Instruction following│
  │ databricks/databricks-dolly-15k          │  2,000  │ General helpfulness │
  │ li2017dailydialog/daily_dialog           │  3,000  │ Natural small talk  │
  │ HuggingFaceH4/ultrachat_200k             │  2,000  │ Multi-turn coherence│
  │ GITHUB_SOURCES (yours, via token)        │  all    │ Your real transcripts│
  │ synthetic sales calls (built in here)    │  ~4,500 │ Objections + JSON   │
  └──────────────────────────────────────────┴─────────┴─────────────────────┘
  HF dataset ids get renamed and re-gated over time. Every loader is wrapped in
  try/except and a failed source is SKIPPED with a warning, never fatal — the
  synthetic generator alone is enough to produce a working brain, so the run
  cannot end empty-handed. Check the DATA SUMMARY table it prints to see what
  actually loaded.

DRAFT RUN vs QUALITY RUN
  Defaults are tuned to SURVIVE a free-tier session: 4-bit, 1 epoch, 45 min cap.
  That gets you a working brain wired into llm-service quickly.

  For the finished model, set QUALITY_RUN=True. It trains 3 epochs, drops 4-bit
  in favour of fp16 LoRA (a 1.5B base fits a T4 with room, so quantising only
  costs speed and a little accuracy), turns off gradient checkpointing and
  doubles the batch. It writes to `checkpoints-<preset>-quality/`, so it never
  collides with a draft run and you can go back and forth.

  A quality run takes several free-tier sessions. That is fine: the time budget
  stops each session cleanly, produces a GGUF from wherever it got to, and the
  next run resumes. You always have a deployable model, and it improves.

WHAT TO LOOK AT AFTER A RUN (no targets promised — these depend on the run)
  • eval loss printed at the end of SECTION 5 (lower than the first logged loss)
  • "JSON validity: N/3" in SECTION 8 — all 3 should parse
  • measured CPU tok/s and estimated /chat latency in SECTION 8
  • training_manifest.json, which records all of the above

=============================================================================
"""

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIG — everything you might want to change lives in this block
# ═══════════════════════════════════════════════════════════════════════════

# "fast" is the default for a deployment reason, not just training speed:
# llm-service runs llama.cpp on 4 CPU threads and ai.service.ts gives /chat an 8s
# axios timeout during a live call. The smallest model leaves the most latency
# headroom. Move to "balanced" only if SECTION 8's measured latency for "fast"
# shows room to spare, or you raise LLM_THREADS / lower max_tokens.
PRESET = "fast"              # "fast" | "balanced" | "quality"
MOUNT_DRIVE = True           # save outputs to Drive so a disconnect is survivable

# Set True to SKIP dataset loading and training entirely and go straight to
# merge → GGUF → benchmark using an adapter you ALREADY trained (it looks in the
# Drive `adapter/` folder, then the local one). Use this when training finished
# but a later stage failed — it turns a ~50 minute redo into about 10 minutes,
# and costs no GPU quota for training.
SKIP_TRAINING = False

# SECTION 8 runs the finished GGUF on CPU to measure real tok/s and check that
# /qualify emits valid JSON. It is a DIAGNOSTIC — the model is already written
# to Drive before it starts. Set False to skip it if it ever misbehaves; you
# lose only the measured numbers, never the model.
RUN_BENCHMARK = True
DRIVE_SUBDIR = "marketing-fyp/llm"

# Stop training after this many minutes and still go on to merge + quantise, so a
# free-tier session always ends with a usable GGUF instead of nothing. Set to 0
# to disable the cap and train the full epoch.
TRAIN_TIME_BUDGET_MIN = 45

# ── QUALITY_RUN — for a finished model rather than a first working one ──────
# The defaults above are tuned to survive a free-tier session. This trades that
# for quality and speed, and writes to its OWN checkpoint folder so it never
# collides with a draft run already in progress.
#
#   3 epochs         eval loss is still falling at the end of epoch 1, so there
#                    is real headroom left; 2-3 epochs is standard for LoRA SFT.
#   no 4-bit         Qwen2.5-1.5B in fp16 is only ~3.1 GB and fits a T4 with room
#                    to spare. QLoRA exists to make big models fit, and at this
#                    size the dequantise-every-forward cost buys nothing —
#                    dropping it is both faster per step and slightly more
#                    accurate, since training no longer sees quantisation error.
#   no grad ckpt     recomputing activations trades ~30% speed for memory we are
#                    no longer short of.
#   batch 4          fewer, larger steps keep the GPU busier.
#
# Estimated, NOT measured: together these should cut seconds/step well below the
# 6.9 s/step a 4-bit + checkpointed run measured on a T4. The [throughput] line
# after 25 steps prints the real figure — trust that.
#
# If it hits CUDA OOM, set QUALITY_GRAD_CHECKPOINTING=True first, then drop
# QUALITY_BATCH to 2. Both cost speed, neither costs quality.
QUALITY_RUN = False
QUALITY_EPOCHS = 3
QUALITY_BATCH = 4
QUALITY_LOAD_IN_4BIT = False
QUALITY_GRAD_CHECKPOINTING = False

MAX_SEQ_LEN = 768            # p95 of the corpus is ~840 tokens; 768 truncates little
NUM_EPOCHS = 1               # 1 epoch over a broad mix beats 3 over a narrow one
LEARNING_RATE = 2e-4         # standard QLoRA LR
LORA_R = 32
LORA_ALPHA = 64
LORA_DROPOUT = 0.05
SEED = 42

# Per-preset sample cap — sized so the whole run fits a free-tier session.
SAMPLE_CAP = {"fast": 12000, "balanced": 8000, "quality": 4000}

BASE_MODEL = {
    "fast":     "Qwen/Qwen2.5-1.5B-Instruct",
    "balanced": "Qwen/Qwen2.5-3B-Instruct",
    "quality":  "meta-llama/Meta-Llama-3.1-8B-Instruct",   # gated: needs HF_TOKEN
}

# Your own data in a (private) GitHub repo. Leave empty to skip entirely.
# Accepts .jsonl / .json / .csv under `path`. Schemas understood:
#   {"messages":[{"role","content"},...]}          ← preferred
#   {"conversations":[{"from","value"},...]}
#   {"instruction","input","output"} | {"prompt","completion"} | {"question","answer"}
GITHUB_SOURCES = [
    # {"repo": "Huma-Sheikh/sales-transcripts", "path": "data", "branch": "main"},
]

# The system prompt trained into the model AND used by llm-service at runtime.
# Keep these two in sync — they are what makes the fine-tune actually pay off.
SALES_SYSTEM_PROMPT = (
    "You are a professional AI sales agent for an AI marketing automation "
    "platform. Be warm, natural and concise. Reply in at most 2 short sentences, "
    "then ask one qualifying question. Never be pushy, never invent pricing, and "
    "always respect a clear no."
)
QUALIFY_SYSTEM_PROMPT = (
    "You analyse sales call transcripts. Reply with ONE line of strict JSON and "
    "nothing else: {\"outcome\": \"qualified|not-interested|callback|voicemail|"
    "contacted\", \"score\": 0-100, \"notes\": \"brief reason\"}"
)

OUTCOMES = ["qualified", "not-interested", "callback", "voicemail", "contacted"]

# ── Resolve the draft/quality settings into the values the rest of the file uses.
# A quality run changes model dtype, batch size and epoch count, none of which a
# draft checkpoint can be resumed into, so it also takes its own folder suffix.
if QUALITY_RUN:
    EFFECTIVE_EPOCHS = QUALITY_EPOCHS
    FORCE_BATCH = QUALITY_BATCH
    LOAD_IN_4BIT = QUALITY_LOAD_IN_4BIT
    GRAD_CHECKPOINTING = QUALITY_GRAD_CHECKPOINTING
    CKPT_SUFFIX = "-quality"
else:
    EFFECTIVE_EPOCHS = NUM_EPOCHS
    FORCE_BATCH = None           # fall back to the GPU-size heuristic
    LOAD_IN_4BIT = True
    GRAD_CHECKPOINTING = True
    CKPT_SUFFIX = ""


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 0 — Install dependencies (runs first, before any heavy import)
# ═══════════════════════════════════════════════════════════════════════════

import os
import subprocess
import sys
import time

_T0 = time.time()


def _stage(title):
    """Consistent section banner so a 70-minute log stays readable."""
    elapsed = int(time.time() - _T0)
    print("\n" + "=" * 74)
    print(f"  {title}    [t+{elapsed // 60:02d}:{elapsed % 60:02d}]")
    print("=" * 74, flush=True)


def _sh(cmd, check=True, capture=False, cwd=None, env=None):
    """Run a shell command, streaming output unless we need to parse it."""
    if capture:
        return subprocess.run(cmd, shell=True, cwd=cwd, env=env, check=False,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, errors="replace")
    return subprocess.run(cmd, shell=True, cwd=cwd, env=env, check=check)


def _sh_quiet(cmd, what, cwd=None):
    """
    Run a noisy build command silently, but print the tail of its log if it fails.

    Sending a failing cmake build to /dev/null and then raising is the fastest way
    to make a Colab run undebuggable, so failures always surface their output.
    """
    res = _sh(cmd, capture=True, cwd=cwd)
    if res.returncode != 0:
        print(f"\n--- {what} FAILED (last 40 lines) ---")
        print("\n".join((res.stdout or "").splitlines()[-40:]))
        raise SystemExit(f"{what} failed. See the log above.")
    return res


_stage("SECTION 0 — Installing dependencies (~3-4 min, quiet)")

_PKGS = [
    "transformers>=4.46,<5",
    "peft>=0.13",
    "accelerate>=1.0",
    "bitsandbytes>=0.44",
    "datasets>=3.0",
    "sentencepiece",
    "protobuf",
    "gguf",
    "huggingface_hub>=0.26",
    "requests",
    "pandas",
]
_sh(f'{sys.executable} -m pip install -q --upgrade ' + " ".join(f'"{p}"' for p in _PKGS))
print("Dependencies installed.")


def _neutralise_stale_torchao():
    """
    Remove Colab's preinstalled torchao when it is older than peft's floor.

    peft's is_torchao_available() RAISES ImportError when torchao is importable
    but below 0.16 — it only returns False when torchao is absent entirely. Colab
    ships 0.10.0. Nothing here uses torchao, but peft's LoRA layer dispatch walks
    every dispatcher looking for a match, and the torchao one is reached whenever
    an earlier dispatcher does not claim the layer.

    This bites specifically at MERGE time, not during training: dispatch_bnb_4bit
    is registered before the torchao dispatcher and "first match wins", so a 4-bit
    training base never reaches torchao. The merge loads a plain fp16 base, bnb
    returns None, and the stale-torchao check then blows up 45 minutes in.

    Uninstalling is safer than upgrading: a newer torchao can drag in a different
    torch and break the CUDA pairing Colab already has working.
    """
    import importlib
    import importlib.util
    import re as _re

    try:
        if importlib.util.find_spec("torchao") is None:
            return
        from importlib.metadata import version as _pkg_version
        current = _pkg_version("torchao")
    except Exception:
        return

    parts = tuple(int(n) for n in _re.findall(r"\d+", current)[:3])
    if parts >= (0, 16, 0):
        return

    print(f"  torchao {current} < 0.16 — peft raises on it. Uninstalling (unused here).")
    _sh(f"{sys.executable} -m pip uninstall -y -q torchao", check=False)
    importlib.invalidate_caches()


_neutralise_stale_torchao()

import gc
import json
import random
import re
import shutil
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import torch

random.seed(SEED)

# ── GPU check ─────────────────────────────────────────────────────────────
if not torch.cuda.is_available():
    raise SystemExit(
        "\nNo CUDA GPU found. 4-bit QLoRA cannot run on CPU.\n"
        "Fix: Colab menu → Runtime → Change runtime type → Hardware accelerator: T4 GPU\n"
        "Then re-run this cell."
    )

_GPU_NAME = torch.cuda.get_device_name(0)
_GPU_GB = torch.cuda.get_device_properties(0).total_memory / 1e9
_CC = torch.cuda.get_device_capability(0)

# Do NOT use torch.cuda.is_bf16_supported() here: it returned True on a T4
# (compute 7.5) in a real run of this script, and that run trained at ~59 s/step.
# Native bf16 kernels start at compute capability 8.0 (Ampere: A100/A10/L4...).
_BF16 = _CC[0] >= 8
_DTYPE = torch.bfloat16 if _BF16 else torch.float16
print(f"GPU: {_GPU_NAME}  (compute {_CC[0]}.{_CC[1]}, {_GPU_GB:.1f} GB)")
print(f"Compute dtype: {'bfloat16' if _BF16 else 'float16 (pre-Ampere GPU)'}")

MODEL_ID = BASE_MODEL[PRESET]
MAX_SAMPLES = SAMPLE_CAP[PRESET]
print(f"Preset '{PRESET}' → base model {MODEL_ID}, sample cap {MAX_SAMPLES:,}")

if PRESET == "quality" and _GPU_GB < 20:
    print("\n  WARNING: preset 'quality' (8B) on a <20GB GPU will be extremely slow\n"
          "  and will likely hit the free-tier session limit before finishing.\n"
          "  Switch PRESET to 'balanced' unless you are on Colab Pro (A100/L4).\n")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 1 — Secrets (HF + GitHub) and output directories
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 1 — Secrets and output paths")


def get_secret(name: str) -> Optional[str]:
    """Colab Secrets → environment variable → None. Never prompts, never blocks."""
    try:
        from google.colab import userdata  # type: ignore
        val = userdata.get(name)
        if val:
            return val.strip()
    except Exception:
        pass
    val = os.environ.get(name)
    return val.strip() if val else None


HF_TOKEN = get_secret("HF_TOKEN") or get_secret("HUGGINGFACE_TOKEN")
GITHUB_TOKEN = get_secret("GITHUB_TOKEN") or get_secret("GH_TOKEN")

if HF_TOKEN:
    os.environ["HF_TOKEN"] = HF_TOKEN
    os.environ["HUGGING_FACE_HUB_TOKEN"] = HF_TOKEN
    print("HF_TOKEN found — gated models and private datasets are reachable.")
else:
    print("HF_TOKEN not set — fine for the default Qwen preset (ungated). "
          "Required only for PRESET='quality'.")

if GITHUB_TOKEN:
    print("GITHUB_TOKEN found — private repo sources will be pulled.")
elif GITHUB_SOURCES:
    print("GITHUB_SOURCES configured but no GITHUB_TOKEN — public repos only.")
else:
    print("No GitHub sources configured — skipping (add your own in GITHUB_SOURCES).")

if PRESET == "quality" and not HF_TOKEN:
    raise SystemExit(
        "PRESET='quality' uses meta-llama/Meta-Llama-3.1-8B-Instruct, which is gated.\n"
        "Accept the licence on its HF model page, then add HF_TOKEN to Colab Secrets."
    )

WORK = Path("/content/llm_brain")
OUT = WORK / "out"
ADAPTER_DIR = OUT / "adapter"
MERGED_DIR = OUT / "merged-fp16"
GGUF_DIR = OUT / "gguf"
for d in (WORK, OUT, ADAPTER_DIR, MERGED_DIR, GGUF_DIR):
    d.mkdir(parents=True, exist_ok=True)

DRIVE_DIR: Optional[Path] = None
if MOUNT_DRIVE:
    # Mount is retried: the first attempt fails often enough (popup dismissed,
    # auth timeout, stale /content/drive from a previous crashed session) and
    # without Drive a session crash costs the entire run.
    for attempt in (1, 2):
        try:
            from google.colab import drive  # type: ignore
            drive.mount("/content/drive", force_remount=(attempt == 2))
            DRIVE_DIR = Path("/content/drive/MyDrive") / DRIVE_SUBDIR
            DRIVE_DIR.mkdir(parents=True, exist_ok=True)
            # Prove it is actually writable, not just mounted.
            probe = DRIVE_DIR / ".write_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            print(f"Drive mounted — checkpoints and outputs go to {DRIVE_DIR}")
            break
        except Exception as exc:
            DRIVE_DIR = None
            print(f"Drive mount attempt {attempt} failed: {str(exc)[:120]}")

if DRIVE_DIR is None:
    print("\n  ⚠ NO DRIVE. Checkpoints stay in /content and a session crash loses\n"
          "    the whole run — which is what happened if you are re-reading this.\n"
          "    Fix: run `from google.colab import drive; drive.mount('/content/drive')`\n"
          "    in a scratch cell first, approve the popup, THEN run this cell.\n"
          "    Continuing without Drive.\n")

# Checkpoints live on Drive when available, so a crash resumes instead of restarting.
# Per-preset folder: a 3B checkpoint cannot be resumed into a 1.5B model, so
# switching PRESET must never pick up the other preset's checkpoints.
CKPT_DIR = (DRIVE_DIR if DRIVE_DIR else OUT) / f"checkpoints-{PRESET}{CKPT_SUFFIX}"
CKPT_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 2 — Record schema + normalisers
#
#  Everything from every source is squeezed into one shape:
#      {"task": "chat"|"qualify", "messages": [{"role","content"}, ...]}
#  with the LAST message always being the assistant turn we train on.
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 2 — Loading datasets")

Record = Dict[str, Any]
DATA_STATS: List[Dict[str, Any]] = []


def _clean(text: Any) -> str:
    if text is None:
        return ""
    text = str(text).replace("\r", " ").strip()
    text = re.sub(r"\s{2,}", " ", text)
    return text


def make_chat(turns: List[Dict[str, str]],
              system: Optional[str] = None) -> Optional[Record]:
    """
    Wrap alternating user/assistant turns into a trainable chat record.

    `system` overrides the default prompt. That override is the whole point of
    the per-company examples: if every record carried the SAME system prompt,
    the slot would carry no information and the model would learn the behaviour
    without learning to obey the instruction — which is exactly what happened
    in the first run, where it cheerfully invented a price it was told not to.
    """
    turns = [t for t in turns if _clean(t.get("content"))]

    # Merge consecutive same-role turns. Scraped dialogues frequently split one
    # utterance across rows, and chat templates expect strict alternation.
    merged: List[Dict[str, str]] = []
    for turn in turns:
        if merged and merged[-1]["role"] == turn["role"]:
            merged[-1]["content"] = f"{merged[-1]['content']} {turn['content']}"
        else:
            merged.append(dict(turn))
    turns = merged

    # Drop trailing customer turns. The supervised target must be an agent reply,
    # and sales corpora very often end on the customer — rejecting those outright
    # would silently discard most of goendalf666/sales-conversations.
    while turns and turns[-1]["role"] != "assistant":
        turns.pop()
    if len(turns) < 2:
        return None
    # Long histories add cost without adding signal for a 2-sentence reply task.
    turns = turns[-7:]
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    if len(turns) < 2 or turns[-1]["role"] != "assistant":
        return None
    msgs = [{"role": "system", "content": system or SALES_SYSTEM_PROMPT}]
    msgs += [{"role": t["role"], "content": _clean(t["content"])[:2000]} for t in turns]
    return {"task": "chat", "messages": msgs}


def make_qualify(transcript: str, outcome: str, score: int, notes: str) -> Record:
    """Build a strict-JSON qualification example matching llm-service's contract."""
    payload = json.dumps({"outcome": outcome, "score": int(score), "notes": notes},
                         ensure_ascii=False)
    return {
        "task": "qualify",
        "messages": [
            {"role": "system", "content": QUALIFY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript:\n{_clean(transcript)[:1500]}"},
            {"role": "assistant", "content": payload},
        ],
    }


_ROLE_MAP = {
    "user": "user", "human": "user", "customer": "user", "client": "user",
    "prospect": "user", "caller": "user", "lead": "user", "question": "user",
    "assistant": "assistant", "gpt": "assistant", "bot": "assistant",
    "salesman": "assistant", "salesperson": "assistant", "agent": "assistant",
    "sales": "assistant", "answer": "assistant", "response": "assistant",
}


def normalise_row(row: Dict[str, Any]) -> Optional[Record]:
    """
    Best-effort mapping of an arbitrary row into a chat record.

    Deliberately generic: HF dataset column names drift between versions, and a
    generic normaliser degrades to "skip this row" instead of crashing the run.
    """
    # 1. Already-chat formats
    for key in ("messages", "conversation", "conversations", "dialog", "dialogue",
                "utterances"):
        val = row.get(key)
        if isinstance(val, list) and val:
            turns = []
            for item in val:
                if isinstance(item, dict):
                    role = _ROLE_MAP.get(
                        str(item.get("role") or item.get("from") or "").lower().strip())
                    content = item.get("content") or item.get("value") or item.get("text")
                    if role and content:
                        turns.append({"role": role, "content": _clean(content)})
                elif isinstance(item, str):
                    # daily_dialog: plain list of utterances, strictly alternating
                    turns.append({"role": "user" if len(turns) % 2 == 0 else "assistant",
                                  "content": _clean(item)})
            return make_chat(turns)

    # 2. Numbered-column format (goendalf666/sales-conversations: "0","1","2",...)
    numbered = sorted((k for k in row if str(k).isdigit()), key=lambda k: int(k))
    if len(numbered) >= 2:
        turns = []
        for idx, key in enumerate(numbered):
            text = _clean(row[key])
            if not text:
                continue
            # Rows often carry an explicit "Customer:" / "Salesman:" prefix.
            low = text.lower()
            if low.startswith(("customer:", "client:", "prospect:")):
                role, text = "user", text.split(":", 1)[1]
            elif low.startswith(("salesman:", "salesperson:", "agent:", "sales:")):
                role, text = "assistant", text.split(":", 1)[1]
            else:
                role = "user" if idx % 2 == 0 else "assistant"
            turns.append({"role": role, "content": _clean(text)})
        return make_chat(turns)

    # 3. Single-turn instruction formats
    pairs = [
        ("instruction", "output"), ("instruction", "response"),
        ("prompt", "completion"), ("prompt", "response"),
        ("question", "answer"), ("input", "output"),
        ("query", "response"), ("text", "label_text"),
    ]
    for q_key, a_key in pairs:
        q, a = _clean(row.get(q_key)), _clean(row.get(a_key))
        if q and a:
            context = _clean(row.get("context") or row.get("input") if q_key != "input" else "")
            if context and context != q:
                q = f"{q}\n\n{context}"
            return make_chat([{"role": "user", "content": q},
                              {"role": "assistant", "content": a}])
    return None


# ── HuggingFace sources ───────────────────────────────────────────────────

HF_SOURCES = [
    # (dataset_id, config, split, cap)
    ("goendalf666/sales-conversations",                            None, "train", 6000),
    ("goendalf666/sales-conversations-2",                          None, "train", 3000),
    ("bitext/Bitext-customer-support-llm-chatbot-training-dataset", None, "train", 4000),
    ("MohammadOthman/mo-customer-support-tweets-945k",             None, "train", 3000),
    ("HuggingFaceH4/no_robots",                                    None, "train", 2000),
    ("databricks/databricks-dolly-15k",                            None, "train", 2000),
    # DailyDialog: every copy on the Hub is a loading SCRIPT, and datasets 3.x
    # removed script support ("Dataset scripts are no longer supported"). HF's
    # dataset viewer auto-converts it to parquet on the refs/convert/parquet
    # branch; reading that file with the generic parquet loader needs no script.
    # (Passing config="full" + revision does NOT work — datasets only sees "default".)
    ("parquet", None, "train", 3000, {
        "data_files": {"train": "hf://datasets/roskoN/dailydialog@refs%2Fconvert"
                                "%2Fparquet/full/train/0000.parquet"},
        "label": "roskoN/dailydialog (parquet)"}),
    ("HuggingFaceH4/ultrachat_200k",                        None, "train_sft", 2000),
]


def load_hf_sources() -> List[Record]:
    from datasets import load_dataset

    records: List[Record] = []
    for source in HF_SOURCES:
        loader, config, split, cap = source[:4]
        extra = dict(source[4]) if len(source) > 4 else {}
        ds_id = extra.pop("label", loader)
        t0 = time.time()
        try:
            # streaming=True → no full download, so a 200K-row set costs seconds.
            ds = load_dataset(loader, config, split=split, streaming=True,
                              token=HF_TOKEN, **extra)
            got = 0
            for row in ds:
                rec = normalise_row(dict(row))
                if rec:
                    records.append(rec)
                    got += 1
                if got >= cap:
                    break
            DATA_STATS.append({"source": ds_id, "kept": got,
                               "secs": round(time.time() - t0, 1), "status": "ok"})
            print(f"  ✓ {ds_id:<52} {got:>6,} rows  ({time.time() - t0:.0f}s)")
        except Exception as exc:
            reason = str(exc).split("\n")[0][:90]
            DATA_STATS.append({"source": ds_id, "kept": 0, "secs": 0,
                               "status": f"skipped: {reason}"})
            print(f"  ✗ {ds_id:<52} SKIPPED — {reason}")
    return records


# ── GitHub sources (token-authenticated, private repos supported) ──────────

def _github_api(url: str, token: Optional[str], raw: bool = False):
    import requests

    headers = {"Accept": "application/vnd.github.raw" if raw
               else "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.get(url, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp


def _parse_github_file(name: str, text: str) -> List[Record]:
    """Parse one downloaded file into records. Understands jsonl / json / csv."""
    out: List[Record] = []
    rows: Iterable[Dict[str, Any]] = []
    if name.endswith(".jsonl"):
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    elif name.endswith(".json"):
        blob = json.loads(text)
        rows = blob if isinstance(blob, list) else blob.get("data", [blob])
    elif name.endswith(".csv"):
        import io
        import pandas as pd
        rows = pd.read_csv(io.StringIO(text)).to_dict("records")
    for row in rows:
        if isinstance(row, dict):
            rec = normalise_row(row)
            if rec:
                out.append(rec)
    return out


def load_github_sources() -> List[Record]:
    """
    Pull training files straight out of a GitHub repo through the contents API.

    Uses the API (not raw.githubusercontent) because the API honours a fine-grained
    PAT for private repos, which is the whole point of GITHUB_TOKEN here.
    """
    records: List[Record] = []
    for src in GITHUB_SOURCES:
        repo = src["repo"]
        branch = src.get("branch", "main")
        prefix = src.get("path", "").strip("/")
        try:
            tree = _github_api(
                f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1",
                GITHUB_TOKEN).json()
            files = [n["path"] for n in tree.get("tree", [])
                     if n["type"] == "blob"
                     and n["path"].endswith((".jsonl", ".json", ".csv"))
                     and (not prefix or n["path"].startswith(prefix + "/")
                          or n["path"] == prefix)]
            if not files:
                print(f"  ! {repo}/{prefix}: no .jsonl/.json/.csv files found")
            kept = 0
            for path in files:
                raw = _github_api(
                    f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}",
                    GITHUB_TOKEN, raw=True).text
                got = _parse_github_file(path, raw)
                records.extend(got)
                kept += len(got)
                print(f"  ✓ github:{repo}/{path:<40} {len(got):>6,} rows")
            DATA_STATS.append({"source": f"github:{repo}/{prefix}", "kept": kept,
                               "secs": 0, "status": "ok"})
        except Exception as exc:
            reason = str(exc).split("\n")[0][:90]
            DATA_STATS.append({"source": f"github:{repo}", "kept": 0, "secs": 0,
                               "status": f"skipped: {reason}"})
            print(f"  ✗ github:{repo:<45} SKIPPED — {reason}")
    return records


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 3 — Synthetic sales-call generator
#
#  No public dataset contains "AI cold-caller for a marketing automation SaaS
#  that must answer in 2 sentences and emit our exact qualification JSON". This
#  generator supplies that, and guarantees the run produces a usable model even
#  if every remote source above fails.
# ═══════════════════════════════════════════════════════════════════════════

INDUSTRIES = ["dental clinic", "real estate agency", "law firm", "gym franchise",
              "e-commerce store", "SaaS startup", "restaurant group", "car dealership",
              "insurance brokerage", "home services company", "medical spa",
              "accounting firm", "logistics company", "boutique hotel"]

OPENERS = [
    "Hi, this is Alex calling from the AI marketing team — is now an okay time?",
    "Hey there, Alex here. I'll keep this to thirty seconds — do you have a moment?",
    "Good morning, this is Alex. I'm calling about lead generation for your {industry}.",
]

# (customer line, ideal agent reply, outcome label, score)
OBJECTIONS = [
    ("We're not interested, thanks.",
     "Totally understood, I won't take more of your time. Would it help if I sent one short case study you can look at whenever you like?",
     "not-interested", 12),
    ("I'm too busy right now.",
     "Completely fair, I'll be quick or I can call back. Would later this week work better for you?",
     "callback", 58),
    ("How much does it cost?",
     "It depends on call volume, so I'd rather quote you accurately than guess. Roughly how many leads do you work through in a month?",
     "qualified", 78),
    ("We already use another agency.",
     "That's good to hear, most of our clients came from one. What's the one thing you wish they did better?",
     "qualified", 72),
    ("Just send me an email.",
     "Happy to do that. What's the best address, and should I address it to you directly?",
     "callback", 62),
    ("Who gave you my number?",
     "Your business came up in a public directory for {industry}s in your area, and I'll remove you right away if you prefer. Would you like me to?",
     "contacted", 35),
    ("Yes, tell me more about it.",
     "Great — we run AI outreach that calls and emails your leads within a minute of them showing interest. What does your follow-up look like today?",
     "qualified", 88),
    ("Does this actually work for a business like mine?",
     "It works best when you already get inbound leads and just can't reach them fast enough. How many enquiries come in weekly?",
     "qualified", 80),
    ("Take me off your list.",
     "Done — I'm removing you now and you won't hear from us again. Sorry for the interruption, have a good day.",
     "not-interested", 5),
    ("Can you call me next Tuesday?",
     "Absolutely, Tuesday works. Is morning or afternoon better for you?",
     "callback", 70),
    ("What makes you different from the others?",
     "We answer leads in under sixty seconds, day or night, which is where most teams lose them. When a lead comes in after hours, what happens right now?",
     "qualified", 76),
    ("I'm the wrong person for this.",
     "No problem at all — who normally handles marketing over there? I'll reach out to them directly.",
     "contacted", 45),
    ("We tried something like this and it didn't work.",
     "That's useful to know, and usually it's the follow-up speed rather than the tool. What went wrong with the last one?",
     "qualified", 68),
    ("Hi, you've reached the voicemail of the sales office, please leave a message.",
     "Hi, this is Alex from the AI marketing team — I'll try again tomorrow, or you can reach me back on this number. Thanks!",
     "voicemail", 28),
]

FOLLOW_UPS = [
    ("That sounds expensive for us.",
     "I hear that a lot before people see the numbers. What would a single extra closed deal a month be worth to you?"),
    ("How long does setup take?",
     "Most teams are live within a week and we handle the setup. Would you want it running before month end?"),
    ("Who else in my industry uses it?",
     "We work with several {industry}s of a similar size, and I can share the closest example. Shall I send that over?"),
    ("Okay, what's the next step?",
     "Simplest is a fifteen minute walkthrough on your own numbers. Would Thursday or Friday suit you better?"),
    ("I need to talk to my partner first.",
     "Makes sense, that's a decision worth sharing. Would it help if I joined a short call with both of you?"),
]

NOTES_BY_OUTCOME = {
    "qualified": ["engaged and asked about the offer", "clear need and open to a demo",
                  "asked pricing and next steps", "shared their current process"],
    "not-interested": ["explicit refusal, opt-out requested", "declined firmly, do not recall",
                       "no interest, removed from list"],
    "callback": ["asked to be contacted later", "busy now, agreed to a later slot",
                 "requested follow-up by email or call"],
    "voicemail": ["reached voicemail, message left", "no live answer, automated greeting"],
    "contacted": ["spoke briefly, no clear signal", "wrong contact, needs routing",
                  "short call, outcome unclear"],
}


# ── Synthetic tenants, for teaching the model to USE the system prompt ─────
# Each entry is the same shape the backend sends in ChatRequest.company, so the
# training prompts are rendered by the very function the service runs.
SYNTHETIC_COMPANIES = [
    {"name": "Bright Smile Dental", "industry": "dental clinic", "agent_name": "Sara",
     "offering": "cosmetic dentistry and same-week emergency appointments",
     "value_props": ["open Saturdays", "0% finance over 500 pounds"],
     "pricing": "consultations are free; whitening starts at 199 pounds",
     "proof": "rated 4.9 from over 600 patient reviews",
     "cta": "book a free consultation"},
    {"name": "IronWorks Gym", "industry": "gym franchise", "agent_name": "Mike",
     "offering": "24/7 gym access with unlimited group classes",
     "value_props": ["no joining fee this month", "free PT induction"],
     "pricing": "29 pounds a month, no contract",
     "proof": "over 3,000 members across 4 sites",
     "cta": "book a free trial day pass"},
    {"name": "Harbour Legal", "industry": "law firm", "agent_name": "Priya",
     "offering": "employment and immigration advice for small businesses",
     "value_props": ["fixed fees, never hourly", "first call is free"],
     "pricing": "fixed fee packages from 450 pounds",
     "proof": "acted for more than 400 SMEs since 2014",
     "cta": "book a free 20 minute case review"},
    {"name": "GreenLeaf Cleaning", "industry": "home services company",
     "agent_name": "Tom", "offering": "weekly domestic and office cleaning",
     "value_props": ["same cleaner every visit", "cancel any time"],
     "pricing": "18 pounds an hour, minimum two hours",
     "proof": "insured and DBS checked, 12 years trading",
     "cta": "book a free quote visit"},
    {"name": "Meridian Accounts", "industry": "accounting firm", "agent_name": "Dana",
     "offering": "bookkeeping and year-end accounts for limited companies",
     "value_props": ["fixed monthly fee", "same-day response"],
     "pricing": "from 95 pounds a month",
     "proof": "over 250 limited company clients",
     "cta": "book a free tax health check"},
]

# Questions whose answers are IN the profile -> ground the reply in those facts.
GROUNDED_QUESTIONS = [
    ("Who is this?", "intro"),
    ("Who am I speaking to?", "intro"),
    ("What do you do?", "offering"),
    ("What is this about?", "offering"),
    ("How much does it cost?", "pricing"),
    ("What are your prices?", "pricing"),
    ("Why should I use you?", "value"),
    ("What makes you different?", "value"),
    ("Have you worked with anyone like me?", "proof"),
    ("What's the next step?", "cta"),
]

# Questions deliberately NOT covered by any profile. These teach the refusal
# that the first model failed: it invented a 1,000-5,000 pound implant price
# when asked something the profile never mentioned.
OUT_OF_SCOPE_QUESTIONS = [
    "Do you do dental implants, and what do they cost exactly?",
    "Can you do it for half that price?",
    "What is your refund policy, word for word?",
    "Do you have a branch in Manchester?",
    "Can you guarantee I'll double my revenue?",
    "Who exactly are your biggest competitors?",
    "What did your last customer pay?",
    "Can you send me the contract terms right now?",
    "Is there a discount if I pay for two years upfront?",
    "Do you offer that service on Sundays as well?",
]

REFUSAL_TEMPLATES = [
    "That's a fair question and I don't want to guess at it. Let me check with the team and come back to you — is this the best number?",
    "I'd rather get you an exact answer than an approximate one. Can I find that out and follow up?",
    "I don't have that detail in front of me and I won't guess. Shall I confirm it and call you back?",
    "Good question — I'd be making that up if I answered now. Let me confirm it and get straight back to you.",
]


def _transcript(turns: List[Dict[str, str]]) -> str:
    role_name = {"user": "Customer", "assistant": "Agent"}
    return "\n".join(f"{role_name[t['role']]}: {t['content']}"
                     for t in turns if t["role"] in role_name)


def _grounded_answer(c: Dict[str, Any], kind: str) -> Optional[str]:
    """A two-sentence reply drawn ONLY from this company's profile."""
    name, agent = c.get("name"), c.get("agent_name")
    if kind == "intro":
        return (f"This is {agent} from {name}. "
                f"Have I caught you at an okay moment?")
    if kind == "offering":
        return (f"We do {c['offering']}. "
                f"What are you using at the moment?")
    if kind == "pricing":
        return (f"{c['pricing'].capitalize()}. "
                f"Would you like me to {c['cta']}?")
    if kind == "value":
        return (f"Mainly {c['value_props'][0]}. "
                f"Is that something that would help you?")
    if kind == "proof":
        return (f"We're {c['proof']}. "
                f"Would it help if I sent you an example?")
    if kind == "cta":
        return (f"Easiest is if I {c['cta']}. "
                f"Would earlier or later in the week suit you?")
    return None


def build_company_examples(n_grounded: int = 2500,
                           n_refusal: int = 1200) -> List[Record]:
    """
    Examples whose system prompt VARIES with the company.

    Two jobs. The grounded ones teach the model to read facts out of the system
    prompt instead of its own priors. The refusals teach it to decline anything
    the prompt does not cover — the behaviour the first model lacked, where it
    answered an out-of-profile question with an invented price.
    """
    records: List[Record] = []

    for _ in range(n_grounded):
        c = random.choice(SYNTHETIC_COMPANIES)
        question, kind = random.choice(GROUNDED_QUESTIONS)
        answer = _grounded_answer(c, kind)
        if not answer:
            continue
        rec = make_chat([{"role": "user", "content": question},
                         {"role": "assistant", "content": answer}],
                        system=build_system_prompt(c, SALES_SYSTEM_PROMPT))
        if rec:
            rec["kind"] = "company"
            records.append(rec)

    for _ in range(n_refusal):
        c = random.choice(SYNTHETIC_COMPANIES)
        rec = make_chat(
            [{"role": "user", "content": random.choice(OUT_OF_SCOPE_QUESTIONS)},
             {"role": "assistant", "content": random.choice(REFUSAL_TEMPLATES)}],
            system=build_system_prompt(c, SALES_SYSTEM_PROMPT))
        if rec:
            rec["kind"] = "company"
            records.append(rec)

    return records


def build_synthetic(n_chat: int = 3000, n_qualify: int = 1500) -> List[Record]:
    """Generate sales-call chat turns plus matching qualification JSON examples."""
    records: List[Record] = []

    for _ in range(n_chat):
        industry = random.choice(INDUSTRIES)
        turns = [{"role": "assistant",
                  "content": random.choice(OPENERS).format(industry=industry)}]
        objection, reply, _, _ = random.choice(OBJECTIONS)
        turns.append({"role": "user", "content": objection.format(industry=industry)})
        turns.append({"role": "assistant", "content": reply.format(industry=industry)})
        # Half the samples get a second exchange so multi-turn context is learned.
        if random.random() < 0.5:
            q, a = random.choice(FOLLOW_UPS)
            turns.append({"role": "user", "content": q.format(industry=industry)})
            turns.append({"role": "assistant", "content": a.format(industry=industry)})
        rec = make_chat(turns)
        if rec:
            records.append(rec)

    for _ in range(n_qualify):
        industry = random.choice(INDUSTRIES)
        objection, reply, outcome, score = random.choice(OBJECTIONS)
        turns = [
            {"role": "assistant", "content": random.choice(OPENERS).format(industry=industry)},
            {"role": "user", "content": objection.format(industry=industry)},
            {"role": "assistant", "content": reply.format(industry=industry)},
        ]
        if random.random() < 0.4:
            q, a = random.choice(FOLLOW_UPS)
            turns.append({"role": "user", "content": q.format(industry=industry)})
            turns.append({"role": "assistant", "content": a.format(industry=industry)})
        jitter = random.randint(-6, 6)
        records.append(make_qualify(
            _transcript(turns), outcome,
            max(0, min(100, score + jitter)),
            random.choice(NOTES_BY_OUTCOME[outcome])))
    return records


# ── Weak-supervision: turn real scraped dialogues into qualify examples ────

def keyword_outcome(transcript: str) -> Optional[Dict[str, Any]]:
    """
    The exact keyword rules llm-service/main.py already uses as its stub.

    Reusing them as weak labels means the fine-tuned model starts out agreeing
    with the deterministic fallback, so swapping the GGUF in never flips existing
    lead outcomes for no reason — it only makes the ambiguous middle smarter.
    """
    low = transcript.lower()
    if any(w in low for w in ["not interested", "no thanks", "remove me", "stop calling"]):
        return {"outcome": "not-interested", "score": 10}
    if any(w in low for w in ["call back", "call me later", "better time", "next week"]):
        return {"outcome": "callback", "score": 60}
    if any(w in low for w in ["voicemail", "leave a message"]):
        return {"outcome": "voicemail", "score": 30}
    if any(w in low for w in ["interested", "tell me more", "send me", "schedule", "demo"]):
        return {"outcome": "qualified", "score": 85}
    return None


def derive_qualify(chat_records: List[Record], limit: int) -> List[Record]:
    out: List[Record] = []
    for rec in chat_records:
        if len(out) >= limit:
            break
        turns = [m for m in rec["messages"] if m["role"] != "system"]
        if len(turns) < 3:
            continue
        transcript = _transcript(turns)
        label = keyword_outcome(transcript)
        if label:
            out.append(make_qualify(transcript, label["outcome"], label["score"],
                                    random.choice(NOTES_BY_OUTCOME[label["outcome"]])))
    return out


# ── Assemble the corpus ───────────────────────────────────────────────────

if SKIP_TRAINING:
    corpus = []
    print("SKIP_TRAINING — dataset loading skipped entirely.")
else:
    hf_records = load_hf_sources()
    gh_records = load_github_sources()
    syn_records = build_synthetic()
    company_records = build_company_examples()
    derived = derive_qualify(hf_records + gh_records, limit=1200)

    DATA_STATS.append({"source": "synthetic (built-in)", "kept": len(syn_records),
                       "secs": 0, "status": "ok"})
    DATA_STATS.append({"source": "per-company prompts + refusals",
                       "kept": len(company_records), "secs": 0, "status": "ok"})
    DATA_STATS.append({"source": "derived qualify (weak labels)", "kept": len(derived),
                       "secs": 0, "status": "ok"})

    all_records = hf_records + gh_records + syn_records + company_records + derived
    random.shuffle(all_records)

    # Deduplicate on (prompt, response), not the response alone. Scraped sales sets
    # repeat heavily so dedup is needed — but qualify targets are short JSON drawn
    # from 5 outcomes × a handful of notes, so a response-only key collapses
    # thousands of DISTINCT transcripts into a few hundred rows and starves the
    # JSON task. Including the prompt keeps them.
    seen = set()
    deduped: List[Record] = []
    for rec in all_records:
        # Full strings, not prefixes: transcripts share near-identical openers, so a
        # prefix key would still merge records that only differ further in.
        prompt = rec["messages"][-2]["content"] if len(rec["messages"]) > 1 else ""
        key = (rec["task"], prompt, rec["messages"][-1]["content"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(rec)

    # Keep every qualify example (they are the scarce, schema-critical ones) and
    # fill the remaining budget with chat.
    qualify_recs = [r for r in deduped if r["task"] == "qualify"]
    company_recs = [r for r in deduped if r.get("kind") == "company"]
    chat_recs = [r for r in deduped if r["task"] == "chat"
                 and r.get("kind") != "company"]
    # Three reserved shares. Without a floor of its own, the per-company set
    # (~3.7k of ~25k rows) would be thinned to roughly a thousand rows by the
    # cap — too weak to teach a behaviour that has to override the base model's
    # instinct to be helpful and answer anyway.
    q_keep = min(len(qualify_recs), max(1500, MAX_SAMPLES // 5))
    co_keep = min(len(company_recs), max(2000, MAX_SAMPLES // 4))
    c_keep = max(0, MAX_SAMPLES - q_keep - co_keep)
    corpus = qualify_recs[:q_keep] + company_recs[:co_keep] + chat_recs[:c_keep]
    random.shuffle(corpus)

    print("\n" + "-" * 74)
    print(f"  {'SOURCE':<44}{'ROWS':>8}   STATUS")
    print("-" * 74)
    for s in DATA_STATS:
        status = s["status"] if s["status"] == "ok" else s["status"][:24]
        print(f"  {s['source'][:43]:<44}{s['kept']:>8,}   {status}")
    print("-" * 74)
    print(f"  after dedup: {len(deduped):,}   |   training on: {len(corpus):,} "
          f"({q_keep:,} qualify + {co_keep:,} per-company + "
          f"{min(c_keep, len(chat_recs)):,} chat)")
    print("-" * 74)

    if len(corpus) < 500:
        raise SystemExit("Fewer than 500 usable examples — every source failed. "
                         "Check network/token and re-run.")

    with open(OUT / "train_corpus.jsonl", "w", encoding="utf-8") as fh:
        for rec in corpus:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"Corpus written to {OUT / 'train_corpus.jsonl'}")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 4 — Tokenise with prompt masking
#
#  Loss is computed ONLY on the assistant reply. Training on the prompt tokens
#  too would teach the model to generate customer objections, which is exactly
#  what we don't want a sales agent doing mid-call.
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 4 — Tokenising")

from transformers import (AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig,
                          Trainer, TrainingArguments)

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN,
                                          trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

EOS_ID = tokenizer.eos_token_id
PAD_ID = tokenizer.pad_token_id


def encode(rec: Record) -> Optional[Dict[str, List[int]]]:
    msgs = rec["messages"]
    prompt_msgs, answer = msgs[:-1], msgs[-1]["content"]
    try:
        prompt_ids = tokenizer.apply_chat_template(
            prompt_msgs, tokenize=True, add_generation_prompt=True)
    except Exception:
        return None
    answer_ids = tokenizer(answer, add_special_tokens=False)["input_ids"] + [EOS_ID]

    # Trim oldest history turns before truncating the answer — losing the reply
    # would leave an example with no supervised tokens at all.
    while len(prompt_ids) + len(answer_ids) > MAX_SEQ_LEN and len(prompt_msgs) > 2:
        prompt_msgs = [prompt_msgs[0]] + prompt_msgs[2:]
        prompt_ids = tokenizer.apply_chat_template(
            prompt_msgs, tokenize=True, add_generation_prompt=True)
    # Still too long with one user turn left (long-context rows like dolly):
    # truncate the user TEXT and re-render, rather than slicing the token ids —
    # slicing would cut through the chat-template markup and teach the model a
    # prompt format that never occurs at inference.
    if len(prompt_ids) + len(answer_ids) > MAX_SEQ_LEN:
        overflow = len(prompt_ids) + len(answer_ids) - MAX_SEQ_LEN
        last_user = prompt_msgs[-1]
        keep_chars = len(last_user["content"]) - int(overflow * 4.2) - 32
        if keep_chars < 200:
            return None
        prompt_msgs = prompt_msgs[:-1] + [
            {"role": last_user["role"], "content": last_user["content"][:keep_chars]}]
        prompt_ids = tokenizer.apply_chat_template(
            prompt_msgs, tokenize=True, add_generation_prompt=True)
    if len(prompt_ids) + len(answer_ids) > MAX_SEQ_LEN or len(answer_ids) < 2:
        return None

    input_ids = list(prompt_ids) + list(answer_ids)
    labels = [-100] * len(prompt_ids) + list(answer_ids)
    return {"input_ids": input_ids, "labels": labels}


if SKIP_TRAINING:
    train_ds = eval_ds = []
    print("SKIP_TRAINING — no tokenisation needed.")
else:
    encoded = []
    skipped = 0
    for rec in corpus:
        enc = encode(rec)
        if enc:
            encoded.append(enc)
        else:
            skipped += 1

    lengths = [len(e["input_ids"]) for e in encoded]
    print(f"Encoded {len(encoded):,} examples (skipped {skipped:,}).")
    print(f"Token length — mean {sum(lengths) / len(lengths):.0f}, "
          f"p95 {sorted(lengths)[int(len(lengths) * 0.95)]}, max {max(lengths)}")


    @dataclass
    class PadCollator:
        """Dynamic padding to the longest sequence in the batch (not to MAX_SEQ_LEN)."""

        pad_id: int

        def __call__(self, features: List[Dict[str, List[int]]]) -> Dict[str, torch.Tensor]:
            width = max(len(f["input_ids"]) for f in features)
            input_ids, labels, attn = [], [], []
            for f in features:
                gap = width - len(f["input_ids"])
                input_ids.append(f["input_ids"] + [self.pad_id] * gap)
                labels.append(f["labels"] + [-100] * gap)
                attn.append([1] * len(f["input_ids"]) + [0] * gap)
            return {"input_ids": torch.tensor(input_ids, dtype=torch.long),
                    "labels": torch.tensor(labels, dtype=torch.long),
                    "attention_mask": torch.tensor(attn, dtype=torch.long)}


    class ListDataset(torch.utils.data.Dataset):
        def __init__(self, items):
            self.items = items

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx):
            return self.items[idx]


    split_at = max(1, int(len(encoded) * 0.02))
    eval_ds = ListDataset(encoded[:split_at])
    train_ds = ListDataset(encoded[split_at:])
    print(f"Split — train {len(train_ds):,} | eval {len(eval_ds):,}")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 5 — QLoRA fine-tune
# ═══════════════════════════════════════════════════════════════════════════

# Imported unconditionally: PeftModel is needed by the merge in SECTION 6 even
# when training is skipped.
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training

if not SKIP_TRAINING:
    _stage(f"SECTION 5 — Loading base model "
           f"({'4-bit QLoRA' if LOAD_IN_4BIT else 'fp16 LoRA'}) and attaching LoRA")

    _load_kwargs = dict(device_map={"": 0}, token=HF_TOKEN, trust_remote_code=True)
    if LOAD_IN_4BIT:
        _load_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",      # nf4 > fp4 for normally-distributed weights
            bnb_4bit_use_double_quant=True,  # ~0.4 bits/param saved, no quality cost
            bnb_4bit_compute_dtype=_DTYPE,
        )
    else:
        # fp16 LoRA: no quantise/dequantise on every forward, and no quantisation
        # error in the gradients. Only viable because a 1.5-3B base fits the GPU.
        print(f"  4-bit disabled — training the fp16 base directly "
              f"(~{ {'fast': 3.1, 'balanced': 6.2, 'quality': 16.1}[PRESET]:.1f} GB "
              f"of {_GPU_GB:.1f} GB VRAM)")
    try:
        # transformers 4.57 renamed torch_dtype → dtype (old name warns but still works).
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=_DTYPE, **_load_kwargs)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=_DTYPE, **_load_kwargs)
    model.config.use_cache = False          # incompatible with gradient checkpointing
    if LOAD_IN_4BIT:
        model = prepare_model_for_kbit_training(
            model, use_gradient_checkpointing=GRAD_CHECKPOINTING)
    elif GRAD_CHECKPOINTING:
        # prepare_model_for_kbit_training is 4-bit-specific, but its side effect of
        # making inputs require grad is what lets checkpointing work under LoRA
        # (the frozen base produces no grad on its own). Do that part by hand.
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
        model.enable_input_require_grads()

    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type="CAUSAL_LM",
        # All attention + MLP projections. MLP matters for style/format adaptation,
        # which is most of what this fine-tune is doing.
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # T4 (16GB) fits batch 2; bigger cards fit 4. Effective batch is held at 16.
    per_device_bs = FORCE_BATCH or (4 if _GPU_GB > 20 else 2)
    grad_accum = max(1, 16 // per_device_bs)
    steps_per_epoch = max(1, len(train_ds) // (per_device_bs * grad_accum))
    total_steps = steps_per_epoch * EFFECTIVE_EPOCHS
    print(f"batch {per_device_bs} × accum {grad_accum} = effective 16 | "
          f"{steps_per_epoch} optimiser steps/epoch"
          f"{f' × {EFFECTIVE_EPOCHS} epochs = {total_steps} total' if EFFECTIVE_EPOCHS > 1 else ''}")


    def training_args(**kwargs) -> TrainingArguments:
        """
        Build TrainingArguments while tolerating the transformers API drift.

        `evaluation_strategy` was renamed `eval_strategy` in 4.46 and a few other
        kwargs come and go between releases. Filtering against the live signature is
        cheaper than pinning an exact transformers version that then fights Colab's
        preinstalled torch.
        """
        import inspect

        valid = set(inspect.signature(TrainingArguments.__init__).parameters)
        if "eval_strategy" in kwargs and "eval_strategy" not in valid:
            kwargs["evaluation_strategy"] = kwargs.pop("eval_strategy")
        dropped = [k for k in kwargs if k not in valid]
        for k in dropped:
            kwargs.pop(k)
        if dropped:
            print(f"  (unsupported TrainingArguments in this version, ignored: {dropped})")
        return TrainingArguments(**kwargs)


    args = training_args(
        output_dir=str(CKPT_DIR),
        num_train_epochs=EFFECTIVE_EPOCHS,
        per_device_train_batch_size=per_device_bs,
        per_device_eval_batch_size=per_device_bs,
        gradient_accumulation_steps=grad_accum,
        gradient_checkpointing=GRAD_CHECKPOINTING,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        learning_rate=LEARNING_RATE,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        weight_decay=0.01,
        max_grad_norm=0.3,
        optim="paged_adamw_8bit",           # paged: survives the T4 memory spikes
        fp16=not _BF16,
        bf16=_BF16,
        logging_steps=20,
        eval_strategy="steps",
        eval_steps=max(50, steps_per_epoch // 4),
        save_strategy="steps",
        save_steps=max(50, steps_per_epoch // 4),
        save_total_limit=1,                 # Drive quota: one checkpoint is enough to resume
        group_by_length=True,               # ~25% less padding waste on mixed lengths
        report_to=[],
        seed=SEED,
        # 0 workers: the dataset is in-memory ints with no decoding to parallelise, and
        # forked workers duplicate host RAM, which is the scarce resource on free Colab.
        dataloader_num_workers=0,
    )

    from transformers import TrainerCallback


    class BudgetCallback(TrainerCallback):
        """
        Two jobs, both learned the hard way on free-tier Colab:

        1. After 25 steps, extrapolate and print the real ETA. If the run is heading
           past the budget you find out in ~2 minutes instead of 70.
        2. Stop training cleanly at TRAIN_TIME_BUDGET_MIN so the script still merges
           and quantises. A partially-trained LoRA is worth far more than a session
           that died at 100% of nothing.
        """

        def __init__(self, budget_min: float, total_steps: int):
            self.budget_s = budget_min * 60 if budget_min else float("inf")
            self.total_steps = total_steps
            self.t0 = None
            self.announced = False
            self.stopped_early = False
            self.start_step = 0

        def on_train_begin(self, args, state, control, **kwargs):
            self.t0 = time.time()
            # Non-zero when resuming; only steps done THIS session should be timed.
            self.start_step = state.global_step

        def on_step_end(self, args, state, control, **kwargs):
            done = state.global_step - self.start_step
            elapsed = time.time() - self.t0
            if not self.announced and done >= 25:
                self.announced = True
                per_step = elapsed / done
                eta_min = per_step * (self.total_steps - state.global_step) / 60
                print(f"\n  [throughput] {per_step:.1f}s/step → full epoch needs "
                      f"~{eta_min:.0f} more min")
                if self.budget_s < float("inf") and eta_min * 60 > self.budget_s:
                    reachable = int(self.budget_s / per_step) + state.global_step
                    print(f"  [throughput] budget is {self.budget_s / 60:.0f} min → will stop "
                          f"at ~step {reachable}/{self.total_steps} "
                          f"({100 * reachable / self.total_steps:.0f}% of an epoch) and "
                          f"still produce the GGUF.")
                if per_step > 25:
                    print("  [throughput] ⚠ unexpectedly slow. On a T4, first check that the "
                          "SECTION 0 dtype line says float16, then check nvidia-smi for "
                          "GPU utilisation.")
            if elapsed > self.budget_s:
                self.stopped_early = True
                control.should_training_stop = True
                # Trainer only auto-saves on save_steps, so without this a later
                # "train longer" re-run would lose everything since the last save.
                control.should_save = True
                print(f"\n  [budget] {self.budget_s / 60:.0f} min reached at step "
                      f"{state.global_step}/{self.total_steps} — stopping cleanly and "
                      f"continuing to merge + quantise.")
            return control


    # total_steps, not steps_per_epoch: a multi-epoch run would otherwise report
    # an ETA and a stop-point against a target it passes at the end of epoch 1.
    budget_cb = BudgetCallback(TRAIN_TIME_BUDGET_MIN, total_steps)

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=PadCollator(PAD_ID),
        callbacks=[budget_cb],
    )

    # ── Resume from the newest checkpoint if a previous session left one ───────
    resume_from = None
    existing = sorted(CKPT_DIR.glob("checkpoint-*"),
                      key=lambda p: int(p.name.split("-")[-1]) if p.name.split("-")[-1].isdigit() else -1)
    if existing:
        resume_from = str(existing[-1])
        print(f"\nFound checkpoint {existing[-1].name} — RESUMING from it "
              f"(delete {CKPT_DIR} to start fresh).")
        print("  Note: resume assumes the same corpus. If a dataset source that loaded\n"
              "  last time was skipped this time, the step alignment shifts — the run\n"
              "  still trains fine, it just replays some examples.")

    _stage(f"SECTION 5 — Training ({len(train_ds):,} examples, ~{total_steps} steps, "
           f"budget {TRAIN_TIME_BUDGET_MIN or '∞'} min)")
    train_result = trainer.train(resume_from_checkpoint=resume_from)

    metrics = trainer.evaluate()
    print(f"\nFinal train loss: {train_result.training_loss:.4f}   "
          f"eval loss: {metrics.get('eval_loss', float('nan')):.4f}")
    if budget_cb.stopped_early:
        print(f"  (stopped at the {TRAIN_TIME_BUDGET_MIN} min budget — to train longer, "
              f"raise TRAIN_TIME_BUDGET_MIN and re-run; it resumes from the checkpoint)")

    trainer.model.save_pretrained(str(ADAPTER_DIR))
    tokenizer.save_pretrained(str(ADAPTER_DIR))
    adapter_mb = sum(f.stat().st_size for f in ADAPTER_DIR.rglob('*') if f.is_file()) / 1e6
    print(f"LoRA adapter saved to {ADAPTER_DIR} ({adapter_mb:.0f} MB)")

    # Push the adapter to Drive NOW, before the merge and GGUF stages. Those are the
    # memory- and disk-hungry ones; if the session dies there, this 100-200MB folder
    # is all you need to redo the rest in minutes.
    if DRIVE_DIR:
        try:
            drive_adapter_safe = DRIVE_DIR / "adapter"
            if drive_adapter_safe.exists():
                shutil.rmtree(drive_adapter_safe)
            shutil.copytree(ADAPTER_DIR, drive_adapter_safe)
            print(f"Adapter mirrored to {drive_adapter_safe} — the run is now crash-safe.")
        except Exception as exc:
            print(f"Could not copy adapter to Drive: {str(exc)[:120]}")

    # Free the 4-bit model before the fp16 merge — both at once will OOM the GPU.
    del trainer, model
    gc.collect()
    torch.cuda.empty_cache()
else:
    # SKIP_TRAINING: adopt an adapter trained in an earlier session.
    _stage("SECTION 5 — SKIPPED (using an already-trained adapter)")
    train_result = metrics = None
    drive_adapter = (DRIVE_DIR / "adapter") if DRIVE_DIR else None
    if drive_adapter and (drive_adapter / "adapter_config.json").exists():
        if ADAPTER_DIR.exists():
            shutil.rmtree(ADAPTER_DIR)
        shutil.copytree(drive_adapter, ADAPTER_DIR)
        print(f"  Adapter copied from Drive: {drive_adapter}")
    elif not (ADAPTER_DIR / "adapter_config.json").exists():
        raise SystemExit(
            "SKIP_TRAINING=True but no trained adapter was found.\n"
            f"  Looked in: {drive_adapter}  and  {ADAPTER_DIR}\n"
            "  Set SKIP_TRAINING=False to train one."
        )
    print(f"  Using adapter at {ADAPTER_DIR} "
          f"({sum(f.stat().st_size for f in ADAPTER_DIR.rglob('*') if f.is_file()) / 1e6:.0f} MB)")
    gc.collect()
    torch.cuda.empty_cache()


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 6 — Merge LoRA into the base weights (fp16)
#
#  Merged on the GPU when VRAM allows. Free Colab has 12.7GB of HOST RAM, and an
#  fp16 3B base plus the PeftModel wrapper plus shard buffers runs right at that
#  ceiling — "session crashed" during merge is usually host-RAM OOM, not VRAM.
#  The GPU is idle and empty by this point, so it is both the safer and the
#  faster place to do it. CPU remains the fallback for a large model.
# ═══════════════════════════════════════════════════════════════════════════

free_vram_gb = (torch.cuda.get_device_properties(0).total_memory
                - torch.cuda.memory_allocated()) / 1e9
# fp16 bytes ≈ 2 × params, plus headroom for the LoRA merge working copy.
model_gb = {"fast": 3.1, "balanced": 6.2, "quality": 16.1}[PRESET]
merge_device = "cuda" if free_vram_gb > model_gb * 1.35 + 1.0 else "cpu"
_stage(f"SECTION 6 — Merging adapter into base weights (fp16, {merge_device.upper()})")
print(f"  base weights ~{model_gb:.1f} GB | free VRAM {free_vram_gb:.1f} GB "
      f"→ merging on {merge_device}")


def _load_base(device: str):
    """from_pretrained renamed torch_dtype→dtype in transformers 4.57."""
    kwargs = dict(device_map={"": 0} if device == "cuda" else {"": "cpu"},
                  token=HF_TOKEN, trust_remote_code=True, low_cpu_mem_usage=True)
    try:
        return AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=torch.float16, **kwargs)
    except TypeError:
        return AutoModelForCausalLM.from_pretrained(
            MODEL_ID, torch_dtype=torch.float16, **kwargs)


try:
    base = _load_base(merge_device)
except torch.cuda.OutOfMemoryError:
    print("  VRAM OOM on merge — falling back to CPU.")
    gc.collect()
    torch.cuda.empty_cache()
    merge_device = "cpu"
    base = _load_base("cpu")

merged = PeftModel.from_pretrained(base, str(ADAPTER_DIR))
merged = merged.merge_and_unload()
merged.config.use_cache = True
# 2GB shards keep peak save-time RAM low; safetensors is what the GGUF converter reads.
merged.save_pretrained(str(MERGED_DIR), safe_serialization=True, max_shard_size="2GB")
tokenizer.save_pretrained(str(MERGED_DIR))

merged_gb = sum(f.stat().st_size for f in MERGED_DIR.rglob("*") if f.is_file()) / 1e9
print(f"Merged fp16 model saved to {MERGED_DIR} ({merged_gb:.1f} GB)")

del base, merged
gc.collect()
torch.cuda.empty_cache()


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 7 — Convert to GGUF and quantise to q4_K_M
#
#  q4_K_M is what llm-service/main.py expects on disk. It is the standard
#  quality/size knee: ~4.8 bits/weight, ~1-2% perplexity cost vs fp16.
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 7 — Getting llama.cpp and converting to GGUF")

LCPP = WORK / "llama.cpp"
if not LCPP.exists():
    # The repo is still needed for convert_hf_to_gguf.py (a Python script that
    # the binary releases do not ship). A shallow clone is seconds.
    _sh_quiet(f"git clone --depth 1 https://github.com/ggml-org/llama.cpp {LCPP}",
              "llama.cpp clone")

# Only the conversion script's deps — the repo's full requirements pull in a
# torch version that would fight the one Colab already has.
_sh(f'{sys.executable} -m pip install -q "gguf>=0.10" "sentencepiece" "protobuf" '
    f'"numpy" "safetensors" "transformers>=4.46"')


def _find(root: Path, names: List[str]) -> Optional[Path]:
    for name in names:
        hits = sorted(root.rglob(name))
        if hits:
            return hits[0]
    return None


PREBUILT_DIR = WORK / "llama_prebuilt"


def _fetch_prebuilt_binaries() -> bool:
    """
    Download the official CPU x64 build instead of compiling it.

    Compiling llama-quantize + llama-cli from source took ~15 minutes of a
    free-tier session in practice. The project publishes a ~17 MB prebuilt
    ubuntu-x64 tarball per build, which is the same two binaries in seconds.
    Returns False on any problem (wrong glibc, network, layout change) so the
    caller falls back to the source build — this is an optimisation, never a
    requirement.
    """
    import re as _re
    import tarfile
    import urllib.request

    try:
        with urllib.request.urlopen(
                "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10",
                timeout=60) as resp:
            releases = json.load(resp)
        # The newest release is not always a llama.cpp build tag, so scan for the
        # first release that actually carries the CPU x64 asset.
        asset = next(
            (a for rel in releases for a in rel.get("assets", [])
             if _re.fullmatch(r"llama-b\d+-bin-ubuntu-x64\.tar\.gz", a["name"])), None)
        if asset is None:
            print("  no prebuilt ubuntu-x64 asset found — building from source.")
            return False

        print(f"  downloading {asset['name']} ({asset['size'] / 1e6:.0f} MB)...")
        PREBUILT_DIR.mkdir(parents=True, exist_ok=True)
        tarball = PREBUILT_DIR / asset["name"]
        urllib.request.urlretrieve(asset["browser_download_url"], tarball)
        with tarfile.open(tarball) as tf:
            tf.extractall(PREBUILT_DIR)
        tarball.unlink(missing_ok=True)

        quantize = _find(PREBUILT_DIR, ["llama-quantize"])
        cli = _find(PREBUILT_DIR, ["llama-cli"])
        if not quantize or not cli:
            print("  prebuilt archive did not contain the expected binaries.")
            return False
        for binary in (quantize, cli):
            binary.chmod(0o755)
        # The binaries link against libggml/libllama shipped alongside them.
        lib_dir = str(quantize.parent)
        os.environ["LD_LIBRARY_PATH"] = lib_dir + ":" + os.environ.get("LD_LIBRARY_PATH", "")

        # Prove it actually runs here before trusting it — a glibc mismatch
        # between the build image and Colab would only show up at exec time.
        probe = _sh(f'"{quantize}" --help', capture=True)
        if probe.returncode not in (0, 1):     # --help exits 1 on some builds
            print(f"  prebuilt binary did not run (exit {probe.returncode}) — "
                  f"building from source instead.")
            return False
        print("  prebuilt llama.cpp binaries are working — skipping the source build.")
        return True
    except Exception as exc:
        print(f"  prebuilt download failed ({type(exc).__name__}: {str(exc)[:120]}) — "
              f"building from source.")
        return False


USING_PREBUILT = _fetch_prebuilt_binaries()
if not USING_PREBUILT:
    # Build only the two binaries we need, not the whole project.
    _sh_quiet(f"cmake -S {LCPP} -B {LCPP}/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF "
              f"-DCMAKE_BUILD_TYPE=Release", "cmake configure")
    _sh_quiet(f"cmake --build {LCPP}/build --config Release -j$(nproc) "
              f"--target llama-quantize llama-cli", "llama.cpp build")


convert_py = _find(LCPP, ["convert_hf_to_gguf.py", "convert-hf-to-gguf.py"])
_bin_root = PREBUILT_DIR if USING_PREBUILT else (LCPP / "build")
quantize_bin = _find(_bin_root, ["llama-quantize", "llama-quantize.exe", "quantize"])
cli_bin = _find(_bin_root, ["llama-cli", "llama-cli.exe", "main"])
print(f"  convert script : {convert_py}")
print(f"  quantize binary: {quantize_bin}")
print(f"  cli binary     : {cli_bin}")

if not convert_py or not quantize_bin:
    raise SystemExit(f"llama.cpp build incomplete (convert={convert_py}, "
                     f"quantize={quantize_bin}). Re-run this cell.")

F16_GGUF = GGUF_DIR / "model-f16.gguf"
Q4_GGUF = GGUF_DIR / "model-q4_K_M.gguf"

res = _sh(f'{sys.executable} "{convert_py}" "{MERGED_DIR}" --outfile "{F16_GGUF}" '
          f'--outtype f16', capture=True)
if not F16_GGUF.exists():
    print(res.stdout[-3000:])
    raise SystemExit("GGUF conversion failed — see the log above.")
print(f"f16 GGUF: {F16_GGUF.stat().st_size / 1e9:.2f} GB")

res = _sh(f'"{quantize_bin}" "{F16_GGUF}" "{Q4_GGUF}" Q4_K_M $(nproc)', capture=True)
if not Q4_GGUF.exists():
    print(res.stdout[-3000:])
    raise SystemExit("Quantisation failed — see the log above.")
q4_gb = Q4_GGUF.stat().st_size / 1e9
print(f"q4_K_M GGUF: {q4_gb:.2f} GB  "
      f"({F16_GGUF.stat().st_size / Q4_GGUF.stat().st_size:.1f}× smaller than f16)")

# The f16 copy is only useful for re-quantising later; drop it if space is tight.
F16_GGUF.unlink(missing_ok=True)

# ── Ship the GGUF to Drive RIGHT NOW, before the benchmark ────────────────
# This is the deliverable. Leaving the copy until SECTION 10 meant a benchmark
# that hung took the finished model down with it when the session was killed —
# 20 minutes of merge and quantise thrown away for a diagnostic. Nothing after
# this point is allowed to be the reason you lose the model.
final_gguf = OUT / "model-q4_K_M.gguf"
shutil.move(str(Q4_GGUF), str(final_gguf))
if DRIVE_DIR:
    try:
        shutil.copy2(final_gguf, DRIVE_DIR / final_gguf.name)
        print(f"GGUF saved to {DRIVE_DIR / final_gguf.name} — safe from here on.")
    except Exception as exc:
        print(f"  ! could not copy the GGUF to Drive: {str(exc)[:160]}")
        print(f"  ! download it manually from {final_gguf} before the session ends.")
else:
    print(f"  ⚠ No Drive — download {final_gguf} NOW; it is lost on disconnect.")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 8 — Smoke test on CPU, exactly how production runs it
#
#  Tested through llama-cli with 4 threads and no GPU, matching
#  llm-service's Llama(n_ctx=2048, n_threads=4) inside Docker. A GPU-side test
#  would report a latency the deployed service can never hit.
# ═══════════════════════════════════════════════════════════════════════════

if RUN_BENCHMARK:
    _stage("SECTION 8 — CPU smoke test + latency benchmark")


    def render_prompt(messages: List[Dict[str, str]]) -> str:
        return tokenizer.apply_chat_template(messages, tokenize=False,
                                             add_generation_prompt=True)


    PROMPT_FILE = WORK / "probe_prompt.txt"
    PROBE_LOG = WORK / "probe_out.log"
    PROBE_TIMEOUT_S = 180


    def _cli_oneshot_flags() -> str:
        """
        Pick the flag that forces ONE completion and exit, by reading --help.

        Modern llama-cli defaults to an interactive CHAT loop. With no terminal on
        stdin it sits there waiting for input that never comes — which is the hour
        this benchmark burned before the session was killed. The previous version
        probed flags by trial and error and its last fallback was no flag at all,
        i.e. exactly that interactive mode. So detect the flag instead of guessing,
        and never fall back to a form that can block.
        """
        help_text = _sh(f'"{cli_bin}" --help', capture=True).stdout or ""
        flags = []
        for candidate in ("-no-cnv", "--no-conversation", "-st", "--single-turn"):
            if candidate in help_text:
                flags.append(candidate)
                break
        else:
            print("  ! no single-turn flag found in llama-cli --help; relying on the "
                  "timeout and a closed stdin to stop it blocking.")
        if "--no-warmup" in help_text:
            flags.append("--no-warmup")
        return " ".join(flags)


    CLI_ONESHOT = _cli_oneshot_flags()


    def run_cli(messages: List[Dict[str, str]], n_predict: int = 96):
        """Generate with llama-cli on CPU; returns (text, tokens_per_second)."""
        prompt = render_prompt(messages)
        # Pass the prompt through a file, not -p "...". The ChatML markup plus
        # arbitrary transcript text through shell=True is a quoting minefield.
        PROMPT_FILE.write_text(prompt, encoding="utf-8")
        cmd = (f'"{cli_bin}" -m "{final_gguf}" -t 4 -c 2048 -n {n_predict} '
               f'--temp 0.7 --top-p 0.9 -ngl 0 -f "{PROMPT_FILE}" {CLI_ONESHOT}')

        # Output goes to a FILE, not a pipe we accumulate in memory. A runaway
        # generation loop filling an in-process buffer is what exhausted the VM's
        # RAM; on disk it is bounded by the timeout instead.
        with open(PROBE_LOG, "wb") as log:
            proc = subprocess.Popen(cmd, shell=True, stdout=log,
                                    stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL)  # never wait on a tty
            try:
                proc.wait(timeout=PROBE_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                print(f"  ! probe exceeded {PROBE_TIMEOUT_S}s and was killed "
                      f"(the model is already saved; this only affects the benchmark).")

        raw = PROBE_LOG.read_bytes()[-200_000:]          # tail only, bounded
        out = raw.decode("utf-8", errors="replace")

        # Take the GENERATION rate, not "prompt eval time" (prompt processing is
        # several times faster and would flatter the latency verdict).
        rates = re.findall(r"(?<!prompt )eval time\s*=.*?([\d.]+)\s+tokens per second", out)
        speed = float(rates[-1]) if rates else float("nan")

        # llama-cli echoes the prompt before the completion; keep only what follows.
        tail_key = prompt[-60:]
        text = out.split(tail_key)[-1] if tail_key in out else out
        text = re.split(r"\[end of text\]|llama_perf|^>\s*$", text, flags=re.M)[0]
        return text.strip(), speed


    chat_tests = [
        "I'm not interested, we already have a marketing agency.",
        "How much does this cost per month?",
        "Can you call me back next Tuesday afternoon?",
    ]
    speeds = []
    print("\n--- /chat behaviour ---")
    for probe in chat_tests:
        msgs = [{"role": "system", "content": SALES_SYSTEM_PROMPT},
                {"role": "user", "content": probe}]
        reply, tps = run_cli(msgs, n_predict=80)
        speeds.append(tps)
        print(f"\n  customer: {probe}")
        print(textwrap.fill(f"  agent:    {reply[:400]}", 92, subsequent_indent=" " * 12))

    print("\n--- /qualify JSON validity ---")
    qualify_probes = [
        ("Agent: Is now a good time?\nCustomer: Not interested, remove me from your list.",
         "not-interested"),
        ("Agent: We automate lead follow-up.\nCustomer: Interesting, can you send me a demo?",
         "qualified"),
        ("Agent: Hi, is now okay?\nCustomer: I'm busy, call me back next week.", "callback"),
    ]
    valid = 0
    for transcript, expected in qualify_probes:
        msgs = [{"role": "system", "content": QUALIFY_SYSTEM_PROMPT},
                {"role": "user", "content": f"Transcript:\n{transcript}"}]
        raw, tps = run_cli(msgs, n_predict=80)
        speeds.append(tps)
        match = re.search(r"\{.*?\}", raw, re.S)
        try:
            parsed = json.loads(match.group(0))
            ok = parsed.get("outcome") in OUTCOMES and isinstance(parsed.get("score"), (int, float))
            valid += int(ok)
            flag = "✓" if parsed.get("outcome") == expected else "~"
            print(f"  {flag} expected={expected:<15} got={json.dumps(parsed)[:110]}")
        except Exception:
            print(f"  ✗ expected={expected:<15} UNPARSEABLE: {raw[:110]!r}")

    speeds = [s for s in speeds if s == s]           # drop NaNs
    cpu_tps = sum(speeds) / len(speeds) if speeds else float("nan")
    budget_tokens = 150                              # llm-service default max_tokens
    est_latency = budget_tokens / cpu_tps if cpu_tps == cpu_tps and cpu_tps > 0 else float("inf")

    print(f"\n  JSON validity: {valid}/{len(qualify_probes)}")
    print(f"  CPU speed (4 threads): {cpu_tps:.1f} tok/s")
    print(f"  Estimated /chat latency at max_tokens=150: {est_latency:.1f}s "
          f"(axios timeout in ai.service.ts is 8s)")
    if est_latency > 6.5:
        print("\n  ⚠ TOO SLOW for live voice calls on this preset. Either:\n"
              "     • re-run this cell with PRESET = 'fast', or\n"
              "     • lower max_tokens to ~90 in ai.service.ts generateResponse(), or\n"
              "     • raise n_threads in llm-service/main.py to match your server's cores.")
    else:
        print("\n  ✓ Comfortably inside the 8s /chat budget.")
else:
    _stage("SECTION 8 — SKIPPED (RUN_BENCHMARK=False)")
    cpu_tps = est_latency = float("nan")
    valid, qualify_probes = 0, []
    print("  No measured tok/s. Time a curl against the deployed llm-service\n"
          "  instead, and compare it with the 8s timeout in ai.service.ts.")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 9 — Emit a drop-in llm-service/main.py matching this model
#
#  The existing service calls llm(prompt) raw-completion style for /qualify,
#  which underuses a chat-tuned model. This version routes both endpoints
#  through the chat template and keeps the keyword rules as the fallback, so
#  the HTTP contract the NestJS AiService depends on is unchanged.
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 9 — Writing drop-in service file")

# ── The per-tenant prompt builder, defined ONCE ────────────────────────────
# This exact source is exec'd by the TRAINING code below and substituted into
# the service file, so the prompt the model is trained against is byte-for-byte
# the prompt it is served. Two copies would silently drift the moment either
# side was edited, and the failure mode is invisible: the model simply stops
# honouring a system prompt whose shape it never saw.
#
# It takes a plain dict (not the pydantic model) precisely so both sides can
# call it — training has no pydantic objects.
COMPANY_PROMPT_SRC = """
MAX_PROFILE_CHARS = 1200


def build_system_prompt(company, base_prompt):
    # Guardrails first, then the tenant's facts. Order matters: the behavioural
    # rules read as the standing instruction, and the company block is framed as
    # the ONLY admissible source of facts, which is what has to stop the agent
    # inventing a price when a prospect pushes.
    if not company:
        return base_prompt

    facts = []
    if company.get("name"):
        facts.append("You work for " + str(company["name"]) + ".")
    if company.get("agent_name"):
        facts.append("Your name is " + str(company["agent_name"]) + ".")
    if company.get("industry"):
        facts.append("They are a " + str(company["industry"]) + ".")
    if company.get("offering"):
        facts.append("What they sell: " + str(company["offering"]))
    if company.get("value_props"):
        facts.append("Why customers choose them: " + "; ".join(company["value_props"]))
    if company.get("pricing"):
        facts.append("Pricing you MAY quote: " + str(company["pricing"]))
    if company.get("proof"):
        facts.append("Proof you may cite: " + str(company["proof"]))
    if company.get("cta"):
        facts.append("The outcome you are asking for: " + str(company["cta"]))
    if company.get("extra"):
        facts.append(str(company["extra"]))

    if not facts:
        return base_prompt

    block = "\\n".join("- " + f for f in facts)[:MAX_PROFILE_CHARS]
    prompt = (
        base_prompt + "\\n\\n"
        + "THE COMPANY YOU REPRESENT. These are the ONLY facts you may state. "
        + "If you are asked anything not covered here - a price, a service, a "
        + "guarantee - do NOT guess: say you will check and follow up.\\n"
        + block
    )
    if company.get("must_not_say"):
        prompt += "\\n- Never mention: " + "; ".join(company["must_not_say"])
    return prompt
"""

# Declared so readers and linters can see where the name comes from; the exec
# on the next line is what actually defines it, from the shared source above.
build_system_prompt = None
exec(COMPANY_PROMPT_SRC, globals())
assert callable(build_system_prompt), "shared prompt builder failed to load"


SERVICE_SRC = '''import json
import logging
import os
import random
import re
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLM Chat Service")

MODELS_DIR = "models"
MODEL_FILE = os.path.join(MODELS_DIR, "model-q4_K_M.gguf")
N_THREADS = int(os.getenv("LLM_THREADS", "4"))

SALES_SYSTEM_PROMPT = __SALES_PROMPT__

QUALIFY_SYSTEM_PROMPT = __QUALIFY_PROMPT__

OUTCOMES = ["qualified", "not-interested", "callback", "voicemail", "contacted"]

llm = None


def load_models():
    global llm
    if not os.path.exists(MODEL_FILE):
        logger.info("LLM model not found - running in stub mode")
        return
    try:
        from llama_cpp import Llama
        llm = Llama(model_path=MODEL_FILE, n_ctx=2048, n_threads=N_THREADS,
                    verbose=False)
        logger.info("Llama model loaded from " + MODEL_FILE)
    except Exception as e:
        logger.warning("LLM load failed (install llama-cpp-python): %s", e)


load_models()

SALES_RESPONSES = [
    "That is great to hear! We help businesses like yours generate more leads through AI-powered outreach. Would you be open to a quick demo this week?",
    "I completely understand. What if we could show you results within the first 30 days?",
    "Absolutely. What is your biggest challenge with lead generation right now?",
    "That makes sense. Our platform automates outreach so your team can focus on closing. Can I send you some case studies?",
    "Perfect timing. Would Thursday or Friday work better for a 15-minute call?",
]


class Message(BaseModel):
    role: str
    content: str


class CompanyProfile(BaseModel):
    """
    Per-tenant facts, supplied by the backend on every /chat call.

    This is how one shared model serves every company. Fine-tuning per tenant
    would mean a ~1GB GGUF and hours of GPU each, rebuilt whenever a customer
    edits their own data; injecting their facts into the system prompt costs
    nothing and takes effect the moment they save the form.

    Only FACTS belong here. The behavioural rules (two sentences, never invent
    pricing, respect a no) stay server-side in SALES_SYSTEM_PROMPT so a tenant
    cannot edit away the guardrails that keep calls compliant.
    """

    name: Optional[str] = None           # "Bright Smile Dental"
    industry: Optional[str] = None       # "dental clinic"
    offering: Optional[str] = None       # what they actually sell
    value_props: Optional[List[str]] = None
    pricing: Optional[str] = None        # only what they are happy to say aloud
    proof: Optional[str] = None          # clients, results, guarantees
    agent_name: Optional[str] = None     # the name the agent gives on the call
    cta: Optional[str] = None            # the specific next step to push for
    must_not_say: Optional[List[str]] = None
    extra: Optional[str] = None          # anything else, free text


class ChatRequest(BaseModel):
    conversation_history: List[Message]
    max_tokens: int = 150
    company: Optional[CompanyProfile] = None


class QualifyRequest(BaseModel):
    transcript: str


MAX_PROFILE_CHARS = 1200
MAX_REPLY_SENTENCES = int(os.getenv("LLM_MAX_SENTENCES", "2"))
# Generation is the expensive half of a turn, and clamp_sentences throws away
# anything past two sentences anyway — so generating the backend's default 150
# tokens just buys latency we then discard. Two sentences is ~40-60 tokens.
MAX_CHAT_TOKENS = int(os.getenv("LLM_MAX_CHAT_TOKENS", "80"))


def clamp_sentences(text: str, limit: int = MAX_REPLY_SENTENCES) -> str:
    """
    Hard-cap the spoken reply length.

    The prompt asks for two sentences; a 1.5B model does not always comply, and
    on a voice call an over-long reply costs latency the 8s /chat budget does
    not have. This enforces it deterministically instead of hoping. A trailing
    fragment with no terminator is dropped rather than spoken half-finished.
    """
    if limit <= 0:
        return text
    # The terminator must be followed by whitespace or end-of-string. Splitting
    # on any '.' cuts "rated 4.9" into "rated 4." — prices and ratings are
    # exactly the facts a sales agent quotes, so this has to hold.
    parts = re.findall(r".*?[.!?](?=\\s|$)", text, re.S)
    if not parts:
        return text.strip()
    return " ".join(p.strip() for p in parts[:limit]).strip()


__PROMPT_BUILDER__


def company_to_dict(company) -> Optional[dict]:
    """CompanyProfile -> plain dict, across pydantic v1 and v2."""
    if company is None:
        return None
    if hasattr(company, "model_dump"):
        return company.model_dump(exclude_none=True)
    return company.dict(exclude_none=True)


def keyword_qualify(transcript: str):
    """Deterministic fallback. Also the weak-supervision source the model was
    fine-tuned against, so model and fallback broadly agree."""
    low = transcript.lower()
    if any(w in low for w in ["not interested", "no thanks", "remove me", "stop calling"]):
        return {"outcome": "not-interested", "score": 10}
    if any(w in low for w in ["call back", "call me later", "better time", "next week"]):
        return {"outcome": "callback", "score": 60}
    if any(w in low for w in ["voicemail", "leave a message"]):
        return {"outcome": "voicemail", "score": 30}
    if any(w in low for w in ["yes", "interested", "tell me more", "send me", "schedule", "demo"]):
        return {"outcome": "qualified", "score": 85}
    return {"outcome": "contacted", "score": 40}


@app.get("/health")
def health():
    return {"status": "ok", "llm_loaded": llm is not None,
            "mode": "production" if llm else "stub", "model": MODEL_FILE}


@app.post("/chat")
async def chat(request: ChatRequest):
    """Generate the next sales-agent turn from the conversation history."""
    if llm is not None:
        try:
            messages = [{"role": "system",
                         "content": build_system_prompt(
                             company_to_dict(request.company), SALES_SYSTEM_PROMPT)}]
            for msg in request.conversation_history[-6:]:
                messages.append({"role": msg.role, "content": msg.content})
            result = llm.create_chat_completion(
                messages=messages,
                max_tokens=min(request.max_tokens, MAX_CHAT_TOKENS),
                temperature=0.7, top_p=0.9)
            text = clamp_sentences(result["choices"][0]["message"]["content"].strip())
            if text:
                return {"response": text, "mode": "model"}
        except Exception as e:
            logger.error("LLM chat error: %s", e)
    return {"response": random.choice(SALES_RESPONSES), "mode": "stub"}


@app.post("/qualify")
async def qualify(request: QualifyRequest):
    """Classify a call transcript into the outcome enum the backend expects."""
    fallback = keyword_qualify(request.transcript)
    if llm is not None:
        try:
            result = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": QUALIFY_SYSTEM_PROMPT},
                    {"role": "user", "content": "Transcript:\\n" + request.transcript[:1500]},
                ],
                max_tokens=120, temperature=0.1)
            raw = result["choices"][0]["message"]["content"]
            match = re.search(r"\\{.*?\\}", raw, re.S)
            data = json.loads(match.group(0))
            if data.get("outcome") in OUTCOMES:
                score = int(max(0, min(100, float(data.get("score", fallback["score"])))))
                notes = str(data.get("notes", ""))[:200] or "model qualification"
                return {"outcome": data["outcome"], "score": score,
                        "notes": notes, "mode": "model"}
            logger.warning("Model returned unknown outcome: %s", data.get("outcome"))
        except Exception as e:
            logger.warning("LLM qualify error: %s", e)
    return {**fallback, "notes": "keyword-based qualification", "mode": "stub"}
'''

service_path = OUT / "llm_service_main.py"
service_path.write_text(
    SERVICE_SRC
    .replace("__PROMPT_BUILDER__", COMPANY_PROMPT_SRC.strip())
    .replace("__SALES_PROMPT__", json.dumps(SALES_SYSTEM_PROMPT))
    .replace("__QUALIFY_PROMPT__", json.dumps(QUALIFY_SYSTEM_PROMPT)),
    encoding="utf-8")
print(f"Drop-in service written to {service_path}")


# ═══════════════════════════════════════════════════════════════════════════
#  SECTION 10 — Copy to Drive + deployment instructions
# ═══════════════════════════════════════════════════════════════════════════

_stage("SECTION 10 — Saving results")

manifest = {
    "preset": PRESET,
    "base_model": MODEL_ID,
    "train_examples": len(train_ds),
    "eval_examples": len(eval_ds),
    "epochs": NUM_EPOCHS,
    "max_seq_len": MAX_SEQ_LEN,
    "lora": {"r": LORA_R, "alpha": LORA_ALPHA, "dropout": LORA_DROPOUT},
    # None when SKIP_TRAINING reused an adapter from an earlier session — the
    # losses belong to that run's manifest, not this one.
    "final_train_loss": (round(float(train_result.training_loss), 4)
                         if train_result is not None else None),
    "eval_loss": (round(float(metrics.get("eval_loss", 0)), 4)
                  if metrics else None),
    "training_skipped": bool(SKIP_TRAINING),
    "gguf_size_gb": round(q4_gb, 2),
    "cpu_tokens_per_second": round(cpu_tps, 1) if cpu_tps == cpu_tps else None,
    "estimated_chat_latency_s": round(est_latency, 1) if est_latency != float("inf") else None,
    "qualify_json_validity": f"{valid}/{len(qualify_probes)}",
    "sources": DATA_STATS,
    "gpu": _GPU_NAME,
    "wall_clock_min": round((time.time() - _T0) / 60, 1),
}
(OUT / "training_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

# final_gguf was moved into place and copied to Drive back in SECTION 7, as soon
# as it existed. It is re-listed here only so the Drive copy stays idempotent.
if DRIVE_DIR:
    for item in (final_gguf, service_path, OUT / "training_manifest.json",
                 OUT / "train_corpus.jsonl"):
        # train_corpus.jsonl is absent on a SKIP_TRAINING run; a missing file
        # here must not cost you the GGUF copy that follows it.
        if item.exists():
            shutil.copy2(item, DRIVE_DIR / item.name)
    drive_adapter = DRIVE_DIR / "adapter"
    if drive_adapter.exists():
        shutil.rmtree(drive_adapter)
    shutil.copytree(ADAPTER_DIR, drive_adapter)
    print(f"Copied GGUF + service + adapter + manifest to {DRIVE_DIR}")

_stage(f"DONE in {manifest['wall_clock_min']:.0f} min")

print(f"""
ARTEFACTS
  {final_gguf}   ({q4_gb:.2f} GB)
  {service_path}
  {ADAPTER_DIR}                 (LoRA only, ~{sum(f.stat().st_size for f in ADAPTER_DIR.rglob('*') if f.is_file()) / 1e6:.0f} MB — keep this, it re-merges anytime)
  {OUT / 'training_manifest.json'}
{f"  {DRIVE_DIR}   (Drive copy)" if DRIVE_DIR else "  (Drive not mounted — download now or you lose these on disconnect)"}

DEPLOY INTO THE PROJECT
  1. Download model-q4_K_M.gguf from Drive (or the Colab Files pane) and put it at:
       python-services/llm-service/models/model-q4_K_M.gguf

  2. Replace the service with the matched version:
       cp llm_service_main.py python-services/llm-service/main.py

  3. Add llama-cpp-python to python-services/llm-service/requirements.txt:
       llama-cpp-python==0.3.2

  4. Rebuild and restart:
       docker-compose up -d --build llm-service

  5. Verify it loaded (expect llm_loaded: true, mode: production):
       curl http://localhost:8004/health

  6. End-to-end check through the NestJS backend:
       curl -X POST http://localhost:8004/chat -H 'Content-Type: application/json' \\
         -d '{{"conversation_history":[{{"role":"user","content":"How much does it cost?"}}],"max_tokens":90}}'
       curl -X POST http://localhost:8004/qualify -H 'Content-Type: application/json' \\
         -d '{{"transcript":"Customer: not interested, remove me."}}'

NOTES
  • Measured CPU speed was {cpu_tps:.1f} tok/s → ~{est_latency:.1f}s per 150-token reply.
    calling.gateway drives /chat during a live call with an 8s axios timeout, so
    keep max_tokens ≤ 150 and raise LLM_THREADS on a bigger host.
  • To retrain on your own call transcripts: put JSONL of
    {{"messages":[{{"role":"user",...}},{{"role":"assistant",...}}]}} in a GitHub repo,
    add it to GITHUB_SOURCES, set GITHUB_TOKEN in Colab Secrets, re-run this cell.
  • To re-quantise without retraining (e.g. Q5_K_M for better quality on a
    beefier server), keep merged-fp16/ and run llama-quantize on it again.
""")
