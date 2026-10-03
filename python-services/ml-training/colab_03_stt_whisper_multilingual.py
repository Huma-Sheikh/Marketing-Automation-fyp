# =============================================================================
#  MULTILINGUAL STT (WHISPER) FINE-TUNING — ONE SELF-CONTAINED COLAB CELL
#  Marketing Automation FYP
#
#  Paste this whole file into ONE Colab cell and run it. There is nothing else
#  to install, download, clone or read: the pip requirements, the dataset
#  catalogue, the training loop, the evaluation and the inference wrapper that
#  the backend service uses are all in this single file.
#
#  ---------------------------------------------------------------------------
#  WHAT IT PRODUCES
#  ---------------------------------------------------------------------------
#  ONE Whisper checkpoint that transcribes all enabled languages (Whisper is
#  natively multilingual; fine-tuning on our own mix sharpens it on these
#  specific languages/accents instead of the generic pretrained weights).
#
#    <DRIVE_ROOT>/stt_model_final/     <- copy to stt-tts-service/models/
#
#  MultilingualSTT (bottom of this file) is the exact loader the service uses.
#
#  ---------------------------------------------------------------------------
#  REQUIREMENTS (installed automatically by section 1 — nothing to run by hand)
#  ---------------------------------------------------------------------------
#    transformers>=4.44.2,<5   datasets>=4.4,<5   dill>=0.4.1   accelerate
#    peft                      jiwer              librosa       soundfile
#    tensorboard               hf_transfer
#  RANGES, not exact pins, on purpose. tokenizers==0.19.1 (what an exact
#  transformers==4.44.2 pin drags in) only publishes wheels up to Python 3.12;
#  on Colab's newer Python pip falls back to compiling it from Rust source,
#  that build fails, and the old version of this cell then killed the kernel
#  anyway — an endless crash/restart loop. The ranges let pip pick the newest
#  4.x transformers + tokenizers with prebuilt wheels for whatever Python Colab
#  runs. transformers stays below 5 because 5 reworked the model internals.
#  datasets must be >=4.4: 3.x caps dill below 0.3.9, which cannot pickle on
#  Python 3.14, and datasets fingerprints (pickles) every Dataset it builds.
#  datasets 4 has no loader scripts, so every corpus below is a Parquet/Arrow
#  repo and audio is decoded here with soundfile + librosa (Audio(decode=False))
#  — deliberately NOT datasets[audio], whose torchcodec dependency must match
#  the exact torch build and would otherwise drag a different torch over
#  Colab's CUDA one.
#  Colab already ships a CUDA torch build — torch is deliberately NOT pinned or
#  reinstalled, that only ever breaks the CUDA pairing. Whisper's saved format
#  is unchanged across 4.x, so an exported checkpoint still loads under the
#  transformers==4.44.2 in stt-tts-service/requirements.txt.
#
#  ---------------------------------------------------------------------------
#  BEFORE THE FIRST RUN (one time, ~2 minutes)
#  ---------------------------------------------------------------------------
#   1. Runtime > Change runtime type > T4 GPU.
#   2. Colab left sidebar > key icon ("Secrets") > "+ Add new secret"
#        Name:  HF_TOKEN
#        Value: a token from https://huggingface.co/settings/tokens (READ is enough)
#      then flip "Notebook access" ON. Safer than pasting a token inline — it
#      never lands in the notebook's saved output. Optional: without it the
#      gated sources below are skipped and everything else still trains.
#   3. Only if you want the gated sources, visit each once and click
#      "Agree and access repository":
#        https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0
#        https://huggingface.co/datasets/humairawan/Urdu-aud01
#
#  ---------------------------------------------------------------------------
#  DATASET CATALOGUE  (the registry in section 4 is the executable version)
#  ---------------------------------------------------------------------------
#  All free, all reachable through datasets.load_dataset(), no paid API keys.
#  Each row is streamed and stopped at a per-language hour budget, so "large"
#  never means "downloads 200 GB" — see WHY STREAMING below.
#
#   Lang | Dataset                | HF id / config                              | Gated
#   -----+------------------------+---------------------------------------------+------
#   en   | LibriSpeech            | openslr/librispeech_asr  clean/train.100    | no
#   en   | LJSpeech               | MikhailT/lj-speech  (parquet mirror)        | no
#   en   | VoxPopuli              | facebook/voxpopuli  en                      | no
#   en   | FLEURS                 | google/fleurs  en_us                        | no
#   en   | Multiling. LibriSpeech | facebook/multilingual_librispeech  english  | no
#   en   | Common Voice 17        | mozilla-foundation/common_voice_17_0  en    | YES
#   de   | VoxPopuli              | facebook/voxpopuli  de                      | no
#   de   | FLEURS                 | google/fleurs  de_de                        | no
#   de   | Multiling. LibriSpeech | facebook/multilingual_librispeech  german   | no
#   de   | Common Voice 17        | mozilla-foundation/common_voice_17_0  de    | YES
#   ar   | FLEURS                 | google/fleurs  ar_eg                        | no
#   ar   | Arabic Speech Corpus   | tunis-ai/arabic_speech_corpus (parquet)     | no
#   ar   | ClArTTS                | MBZUAI/ClArTTS                              | no
#   ar   | Common Voice 17        | mozilla-foundation/common_voice_17_0  ar    | YES
#   ur   | FLEURS                 | google/fleurs  ur_pk                        | no
#   ur   | Urdu-aud01             | humairawan/Urdu-aud01                       | YES
#   ur   | urdu-tts (community)   | muhammadsaadgondal/urdu-tts                 | no
#   ur   | Common Voice 17        | mozilla-foundation/common_voice_17_0  ur    | YES
#   fr   | VoxPopuli              | facebook/voxpopuli  fr                      | no
#   fr   | FLEURS                 | google/fleurs  fr_fr                        | no
#   fr   | Multiling. LibriSpeech | facebook/multilingual_librispeech  french   | no
#   fr   | Common Voice 17        | mozilla-foundation/common_voice_17_0  fr    | YES
#   es   | VoxPopuli              | facebook/voxpopuli  es                      | no
#   es   | FLEURS                 | google/fleurs  es_419                       | no
#   es   | Multiling. LibriSpeech | facebook/multilingual_librispeech  spanish  | no
#   es   | Common Voice 17        | mozilla-foundation/common_voice_17_0  es    | YES
#   hi   | FLEURS                 | google/fleurs  hi_in                        | no
#   hi   | Common Voice 17        | mozilla-foundation/common_voice_17_0  hi    | YES
#
#  FLEURS is read from its auto-converted Parquet branch (refs/convert/parquet)
#  because its main branch is raw tsv + tar.gz, which datasets 4 cannot read.
#  Any other source that still resolves to a loader script is retried on that
#  same branch automatically (_open_stream in section 5), so a repo converted
#  later starts working with no edit here. Common Voice 17 is both gated AND
#  script-based, so it is the one likely to be skipped — it is optional in
#  every language and its share is redistributed to that language's other
#  corpora.
#
#  Base checkpoint: openai/whisper-small (Apache-2.0). USE_LORA below lets you
#  train whisper-medium / whisper-large-v3 on the same free T4.
#
#  Every loader is wrapped: a source that 404s, re-gates or times out is logged
#  and skipped, and training continues on the rest. A single flaky dataset can
#  never kill the run.
#
#  ---------------------------------------------------------------------------
#  WHY STREAMING + AN HOURS BUDGET (the main efficiency change)
#  ---------------------------------------------------------------------------
#  The naive load_dataset(...) downloads and extracts an ENTIRE corpus before
#  you can take a single row — tens of GB for VoxPopuli or MLS, most of a free
#  Colab disk, most of a free Colab session, to then use ~8k clips of it.
#  Here every source is opened with streaming=True and read only until that
#  language's remaining hour budget is filled, so disk and wall-clock scale
#  with what we actually train on, not with what upstream happens to publish.
#  The materialised corpus is cached to Drive (section 5), so a disconnect
#  costs you zero re-download.
#
#  Audio is stored as int16 PCM rather than as precomputed log-mel: 30 s of
#  int16 is ~0.96 MB against ~4.8 MB for a float32 80x3000 mel, and the mel is
#  recomputed in the collator by the dataloader workers while the GPU is busy,
#  so it is free. That is ~5x less Drive traffic per epoch AND it keeps the raw
#  waveform around, which is what makes SpecAugment and any future audio
#  augmentation possible at all.
#
#  ---------------------------------------------------------------------------
#  RESUME BEHAVIOUR — re-running this cell is ALWAYS safe
#  ---------------------------------------------------------------------------
#  * pip install: skipped when the required versions are already importable,
#    and a FAILED install now stops the cell with pip's error instead of
#    restarting the kernel into the same failure again.
#  * corpus build: cached per (source, budget) on Drive, reused verbatim.
#  * training: Trainer checkpoints to Drive every SAVE_STEPS and picks the last
#    one back up automatically.
#  Interrupt (Runtime > Interrupt) at any point: the last checkpoint on Drive
#  is intact and the cell falls through to export + evaluate it.
#
#  MEMORY: call free_memory() from any cell if the runtime feels sluggish.
# =============================================================================

# ----------------------------------------------------------------- SETTINGS
WHISPER_MODEL   = "openai/whisper-small"   # "openai/whisper-medium" / "openai/whisper-large-v3" -> set USE_LORA=True
HF_TOKEN_SECRET = "HF_TOKEN"               # name of the Colab secret
RUN_SETUP       = True                     # pip install (auto-skips when already satisfied)
RUN_TRAINING    = True                     # False = only export/evaluate the existing checkpoint
RUN_PREVIEW     = True                     # per-language WER/CER report + sample transcriptions
SMOKE_TEST      = False                    # True = tiny budget + 30 steps, proves the pipeline in ~5 min

# Corpus size. Budget in HOURS OF AUDIO per language (the unit that actually
# decides training cost), balanced across that language's sources so English
# having 6 corpora and Hindi having 2 does not skew the model towards English.
HOURS_PER_LANGUAGE      = 6.0
MAX_MINUTES_PER_SOURCE  = 12.0   # wall-clock guard: give up on a slow stream and move on
CLIP_SECONDS            = (1.0, 30.0)   # Whisper's encoder is a hard 30 s window
ENABLE_GATED_SOURCES    = True   # Common Voice + Urdu-aud01; silently skipped without a token

# Parameter-efficient fine-tuning. Off for whisper-small (full fine-tune fits a
# T4 comfortably and is slightly better); switch on for medium/large-v3, where
# it is the difference between "fits on a T4" and "does not".
USE_LORA = False

LANGUAGES = {
    "en": True,
    "ur": True,
    "ar": True,
    "de": True,
    "fr": True,    # optional — set False to drop
    "es": True,    # optional — set False to drop
    "hi": True,    # optional — set False to drop
}

# Training hyper-parameters (batch size is chosen from the actual GPU below).
LEARNING_RATE   = 1e-5
NUM_EPOCHS      = 3
WARMUP_RATIO    = 0.05
EVAL_STEPS      = 250
SAVE_STEPS      = 250
SPEC_AUGMENT    = True    # Whisper's own SpecAugment; train-only, applied inside the encoder

# =============================================================================

import os
import gc
import io
import json
import time
import shutil
import inspect
import logging
import subprocess
import sys
import unicodedata
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

# force=True: Colab's kernel pre-installs a root handler, which otherwise makes
# basicConfig a silent no-op and hides every logger.info below.
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", force=True)
logger = logging.getLogger("stt")
logging.getLogger("datasets").setLevel(logging.ERROR)   # streaming is chatty


def sh(cmd, cwd=None, check=False):
    """Run a shell command, streaming its output into the notebook."""
    code = subprocess.run(cmd, shell=True, cwd=cwd).returncode
    if check and code != 0:
        raise RuntimeError(f"command failed ({code}): {cmd}")
    return code


def free_memory():
    """Clear GPU + CPU caches. Safe to call from any cell at any time."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except ImportError:
        pass


def last_checkpoint(output_dir):
    """Newest checkpoint-N folder inside an output dir, or None."""
    output_dir = Path(output_dir)
    if not output_dir.exists():
        return None
    ckpts = [p for p in output_dir.glob("checkpoint-*")
             if p.is_dir() and p.name.split("-")[-1].isdigit()]
    return max(ckpts, key=lambda p: int(p.name.split("-")[-1])) if ckpts else None


def hhmm(seconds):
    """3725 -> '1h02m'. Used all over the corpus-budget logging."""
    seconds = int(seconds)
    return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m" if seconds >= 3600 else f"{seconds // 60}m{seconds % 60:02d}s"


# ------------------------------------------------- 1. ENVIRONMENT + INSTALLS
try:
    from google.colab import drive, userdata
    IN_COLAB = True
except ImportError:
    IN_COLAB = False
    userdata = None

if IN_COLAB and not Path("/content/drive/MyDrive").exists():
    drive.mount("/content/drive")

# (pip spec, distribution name, min version inclusive, max version exclusive)
# RANGES, not exact pins. An exact transformers==4.44.2 drags in
# tokenizers==0.19.1, which only publishes wheels up to Python 3.12; on Colab's
# newer Python pip falls back to compiling it from Rust source, that build
# fails, and the old version of this cell then killed the kernel anyway — an
# endless crash/restart loop. The ranges let pip pick the newest 4.x
# transformers + tokenizers that have prebuilt wheels for whatever Python Colab
# is running. transformers stays below 5 because 5 reworked the model
# internals. datasets must be >=4.4: 3.x caps dill below 0.3.9, which cannot
# pickle on Python 3.14, and datasets fingerprints (pickles) every Dataset it
# builds. datasets 4 has no loader scripts, so every corpus in section 4 is a
# Parquet/Arrow repo and audio is decoded here with soundfile + librosa
# (Audio(decode=False)) — deliberately NOT datasets[audio], whose torchcodec
# dependency must match the exact torch build and would otherwise drag a
# different torch over Colab's CUDA one.
# Colab already ships a CUDA torch build — torch is deliberately NOT pinned or
# reinstalled, that only ever breaks the CUDA pairing. Whisper's saved format
# is unchanged across 4.x, so an exported checkpoint still loads under the
# transformers==4.44.2 in stt-tts-service/requirements.txt.
REQUIREMENTS = [
    ("transformers>=4.44.2,<5",  "transformers", (4, 44, 2), (5,)),
    ("datasets>=4.4.0,<5",       "datasets",     (4, 4, 0),  (5,)),
    # datasets' own range still admits dill 0.3.8, and pip keeps whatever is
    # already installed when it satisfies the range — but dill < 0.4.1 cannot
    # pickle on Python 3.14, and datasets pickles every Dataset it creates.
    ("dill>=0.4.1",              "dill",         (0, 4, 1),  None),
    ("multiprocess>=0.70.19",    "multiprocess", (0, 70, 19), None),
    ("accelerate>=0.33",         "accelerate",   (0, 33),    None),
    ("peft",        "peft",        None, None),
    ("jiwer",       "jiwer",       None, None),
    ("librosa",     "librosa",     None, None),
    ("soundfile",   "soundfile",   None, None),
    ("tensorboard", "tensorboard", None, None),
    ("hf_transfer", "hf_transfer", None, None),
]


def _version_tuple(v):
    out = []
    for part in v.split(".")[:3]:
        digits = "".join(ch for ch in part if ch.isdigit())
        if not digits:
            break
        out.append(int(digits))
    return tuple(out)


def _missing_requirements():
    """pip specs for everything missing or outside its range. Checked rather
    than installed blindly so re-running this cell after a disconnect does NOT
    trigger the pip install and the forced kernel restart all over again."""
    from importlib.metadata import PackageNotFoundError, version
    missing = []
    for spec, dist, lo, hi in REQUIREMENTS:
        try:
            have = _version_tuple(version(dist))
        except PackageNotFoundError:
            missing.append(spec)
            continue
        if (lo and have < lo) or (hi and have >= hi):
            missing.append(spec)
    return missing


def _stack_imports_cleanly():
    """Import the HF stack in a SEPARATE interpreter. Colab's preinstalled
    transformers/huggingface_hub pair is sometimes mismatched ("cannot import
    name ... from huggingface_hub"); version numbers alone cannot see that."""
    probe = ("from transformers import WhisperForConditionalGeneration, WhisperProcessor; "
             "import datasets, tokenizers, accelerate")
    return subprocess.run([sys.executable, "-c", probe], capture_output=True).returncode == 0


def _installed_versions():
    """{normalised distribution name: version} for everything pip can see."""
    from importlib.metadata import distributions
    out = {}
    for d in distributions():
        name = (d.metadata["Name"] or "").lower().replace("_", "-")
        if name:
            out[name] = d.version
    return out


def _stale_loaded_modules(before, after):
    """Top-level modules that pip just replaced on disk but that THIS kernel has
    already imported. Only these force a restart; anything not yet imported is
    simply picked up fresh by the imports further down this cell."""
    from importlib.metadata import packages_distributions
    changed = {n for n, v in after.items() if before.get(n) != v}
    stale = set()
    for module, dists in packages_distributions().items():
        if module in sys.modules and any(d.lower().replace("_", "-") in changed for d in dists):
            stale.add(module)
    return sorted(stale)


class RestartSessionRequired(Exception):
    """Raised (never os.kill) when a restart is genuinely needed, so Colab shows
    a readable message instead of 'Your session crashed for an unknown reason'."""


if RUN_SETUP:
    to_install = _missing_requirements()
    if not to_install and not _stack_imports_cleanly():
        to_install = [spec for spec, dist, _, _ in REQUIREMENTS
                      if dist in ("transformers", "datasets")]
    if to_install:
        print("Installing:", ", ".join(to_install))
        before = _installed_versions()
        # --prefer-binary: never try to compile a Rust/C extension from source
        # when any wheel will do. That source build is exactly what crashed the
        # previous version of this cell on Colab.
        quoted = " ".join(f'"{s}"' for s in to_install)
        code = sh(f'"{sys.executable}" -m pip install -q --prefer-binary {quoted}')
        if code != 0 or _missing_requirements() or not _stack_imports_cleanly():
            # Stop HERE, with the kernel alive and pip's error above.
            raise RuntimeError(
                f"pip install failed (exit code {code}) — scroll up for pip's own error. "
                f"The kernel was NOT restarted. Still missing: {_missing_requirements() or 'import check failed'}"
            )
        import importlib
        importlib.invalidate_caches()
        stale = _stale_loaded_modules(before, _installed_versions())
        if stale:
            # The previous version of this cell called os.kill(os.getpid(), 9)
            # here, which Colab reports as "Your session crashed for an unknown
            # reason" on EVERY fresh runtime. Stop cleanly instead.
            raise RestartSessionRequired(
                "\n" + "=" * 72 +
                "\n  Dependencies installed, but these were already imported in this kernel:"
                f"\n    {', '.join(stale)}"
                "\n  Do: Runtime > Restart session, then run this SAME cell again."
                "\n  (Nothing crashed. The second run skips setup and continues.)\n" + "=" * 72
            )
        logger.info("dependencies installed — none were loaded yet, continuing without a restart")
    else:
        logger.info("dependencies already satisfied — skipping pip install")

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")  # silences the fork warning
# huggingface_hub raises on every download when this flag is set but the
# hf_transfer package is absent (RUN_SETUP=False on a fresh VM), so only
# enable the fast path when it can actually be used.
try:
    import hf_transfer  # noqa: F401
    os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")
except ImportError:
    os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)

import numpy as np
import torch

if not torch.cuda.is_available():
    raise RuntimeError(
        "No GPU attached. Runtime > Change runtime type > T4 GPU, then re-run this cell. "
        "Whisper fine-tuning on CPU is not viable."
    )

GPU_NAME = torch.cuda.get_device_name(0)
GPU_MEM_GB = torch.cuda.get_device_properties(0).total_memory / 1e9
SUPPORTS_BF16 = torch.cuda.is_bf16_supported()
print(f"GPU: {GPU_NAME}  ({GPU_MEM_GB:.0f} GB, bf16={'yes' if SUPPORTS_BF16 else 'no'})")


# ------------------------------------------------------- 2. HUGGING FACE AUTH
from huggingface_hub import login

HF_TOKEN = None
if IN_COLAB:
    try:
        HF_TOKEN = userdata.get(HF_TOKEN_SECRET)
    except Exception as e:
        logger.warning(f"could not read Colab secret '{HF_TOKEN_SECRET}': {e}")
HF_TOKEN = HF_TOKEN or os.environ.get("HF_TOKEN")

if HF_TOKEN:
    login(token=HF_TOKEN)
    os.environ["HF_TOKEN"] = HF_TOKEN
    os.environ["HUGGING_FACE_HUB_TOKEN"] = HF_TOKEN
    print("Logged in to Hugging Face.")
else:
    logger.warning(
        f"No Hugging Face token (Colab secret '{HF_TOKEN_SECRET}' not set). The gated sources "
        f"— Common Voice 17 and humairawan/Urdu-aud01 — will be skipped; every other dataset "
        f"still loads and training proceeds normally."
    )
    ENABLE_GATED_SOURCES = False


# --------------------------------------------------------------- 3. PATHS
DRIVE_ROOT = (Path("/content/drive/MyDrive/marketing_fyp_speech")
              if Path("/content/drive/MyDrive").exists() else Path("./marketing_fyp_speech"))
OUTPUT_DIR    = DRIVE_ROOT / "stt_whisper_checkpoints"
FINAL_DIR     = DRIVE_ROOT / "stt_model_final"
CORPUS_CACHE  = DRIVE_ROOT / "stt_corpus_cache"      # durable int16 shards, one per source
# Scratch for HF's own download/Arrow intermediates. Deliberately on the local
# VM disk, not Drive: these are rebuildable from the durable shards above, and
# Drive writes are both slow and quota-limited, so keeping ~2x the corpus of
# throwaway Arrow files there is the single easiest way to run out of both.
HF_CACHE      = Path("/content/hf_cache") if Path("/content").exists() else DRIVE_ROOT / "hf_cache"
# Local-disk copies of the Drive shards — what training actually memory-maps.
LOCAL_CORPUS  = Path("/content/stt_corpus_local") if Path("/content").exists() else DRIVE_ROOT / "stt_corpus_local"
for p in (OUTPUT_DIR, FINAL_DIR, CORPUS_CACHE, HF_CACHE, LOCAL_CORPUS):
    p.mkdir(parents=True, exist_ok=True)

ACTIVE_LANGS = [c for c, on in LANGUAGES.items() if on]

if SMOKE_TEST:
    HOURS_PER_LANGUAGE = 0.05
    MAX_MINUTES_PER_SOURCE = 1.0
    NUM_EPOCHS = 1
    EVAL_STEPS = SAVE_STEPS = 10
    logger.warning("SMOKE_TEST=True — tiny corpus and a handful of steps. Flip it off for a real run.")

print(f"Languages     : {ACTIVE_LANGS}")
print(f"Budget        : {HOURS_PER_LANGUAGE} h of audio per language")
print(f"Checkpoints   : {OUTPUT_DIR}")
print(f"Final export  : {FINAL_DIR}")


# --------------------------------------------------- 4. THE DATASET REGISTRY
# One row per (language, corpus). `weight` is that source's share of the
# language's hour budget, normalised across whatever actually loads — so if
# Common Voice is skipped for lack of a token, the remaining sources absorb its
# share instead of the language quietly ending up under-represented.
#
# datasets 4 removed loader scripts, so every entry has to resolve to a
# Parquet/Arrow repo. Where the canonical dataset is still a loader script this
# uses either a Parquet mirror (LJSpeech, Arabic Speech Corpus) or the Hub's
# auto-converted Parquet branch via `revision` (FLEURS). _open_stream() also
# retries any source on that branch by itself, so a repo that gets converted
# later starts working with no edit here.
@dataclass
class Source:
    lang: str
    name: str
    path: str
    config: Optional[str] = None
    split: str = "train"
    text_key: str = "sentence"
    audio_key: str = "audio"
    weight: float = 1.0
    gated: bool = False
    revision: Optional[str] = None         # e.g. the auto-converted Parquet branch
    transliteration: Optional[str] = None  # "buckwalter": transcript is ASCII-encoded Arabic


# The Hub auto-converts public datasets to Parquet on this ref. FLEURS' main
# branch is tsv + tar.gz, which datasets 4 cannot read.
PARQUET_BRANCH = "refs/convert/parquet"

REGISTRY: List[Source] = [
    # ---- English ---------------------------------------------------------
    Source("en", "LibriSpeech",  "openslr/librispeech_asr", "clean", "train.100", "text",       weight=1.0),
    # keithito/lj_speech is a loader-script repo; this is a Parquet copy of it.
    Source("en", "LJSpeech",     "MikhailT/lj-speech",      None,    "full",      "normalized_text", weight=0.6),
    Source("en", "VoxPopuli",    "facebook/voxpopuli",      "en",    "train",     "normalized_text", weight=0.8),
    Source("en", "FLEURS",       "google/fleurs",           "en_us", "train",     "transcription",   weight=0.6, revision=PARQUET_BRANCH),
    Source("en", "MLS",          "facebook/multilingual_librispeech", "english", "train", "transcript", weight=0.6),
    Source("en", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "en", "train", "sentence", weight=1.0, gated=True),
    # ---- German ----------------------------------------------------------
    Source("de", "VoxPopuli",    "facebook/voxpopuli",      "de",    "train",     "normalized_text", weight=1.0),
    Source("de", "FLEURS",       "google/fleurs",           "de_de", "train",     "transcription",   weight=0.8, revision=PARQUET_BRANCH),
    Source("de", "MLS",          "facebook/multilingual_librispeech", "german", "train", "transcript", weight=0.8),
    Source("de", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "de", "train", "sentence", weight=1.0, gated=True),
    # ---- Arabic ----------------------------------------------------------
    Source("ar", "FLEURS",       "google/fleurs",           "ar_eg", "train",     "transcription",   weight=1.0, revision=PARQUET_BRANCH),
    # halabi2016/arabic_speech_corpus is a loader-script repo; this is a Parquet
    # copy. Its transcripts are Buckwalter transliteration ("waraj~aHa"), not
    # Arabic script, so they are converted back below. "orthographic" is the
    # clean spelling; "text" carries phonetic respellings.
    Source("ar", "ArabicSpeechCorpus", "tunis-ai/arabic_speech_corpus", None, "train", "orthographic",
           weight=0.8, transliteration="buckwalter"),
    Source("ar", "ClArTTS",      "MBZUAI/ClArTTS",          None,    "train",     "AUTO",            weight=0.8),
    Source("ar", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "ar", "train", "sentence", weight=1.0, gated=True),
    # ---- Urdu ------------------------------------------------------------
    Source("ur", "FLEURS",       "google/fleurs",           "ur_pk", "train",     "transcription",   weight=1.0, revision=PARQUET_BRANCH),
    Source("ur", "Urdu-aud01",   "humairawan/Urdu-aud01",   None,    "train",     "text",            weight=1.0, gated=True),
    Source("ur", "urdu-tts",     "muhammadsaadgondal/urdu-tts", None, "train",    "AUTO",            weight=0.8),
    Source("ur", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "ur", "train", "sentence", weight=1.0, gated=True),
    # ---- French ----------------------------------------------------------
    Source("fr", "VoxPopuli",    "facebook/voxpopuli",      "fr",    "train",     "normalized_text", weight=1.0),
    Source("fr", "FLEURS",       "google/fleurs",           "fr_fr", "train",     "transcription",   weight=0.8, revision=PARQUET_BRANCH),
    Source("fr", "MLS",          "facebook/multilingual_librispeech", "french", "train", "transcript", weight=0.8),
    Source("fr", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "fr", "train", "sentence", weight=1.0, gated=True),
    # ---- Spanish ---------------------------------------------------------
    Source("es", "VoxPopuli",    "facebook/voxpopuli",      "es",    "train",     "normalized_text", weight=1.0),
    Source("es", "FLEURS",       "google/fleurs",           "es_419", "train",    "transcription",   weight=0.8, revision=PARQUET_BRANCH),
    Source("es", "MLS",          "facebook/multilingual_librispeech", "spanish", "train", "transcript", weight=0.8),
    Source("es", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "es", "train", "sentence", weight=1.0, gated=True),
    # ---- Hindi -----------------------------------------------------------
    Source("hi", "FLEURS",       "google/fleurs",           "hi_in", "train",     "transcription",   weight=1.0, revision=PARQUET_BRANCH),
    Source("hi", "CommonVoice",  "mozilla-foundation/common_voice_17_0", "hi", "train", "sentence", weight=1.0, gated=True),
]

SOURCES = [s for s in REGISTRY if s.lang in ACTIVE_LANGS and (ENABLE_GATED_SOURCES or not s.gated)]


# ---------------------------------------------- 5. MATERIALISE THE CORPUS
from datasets import (
    Audio, Dataset, DatasetDict, Features, Sequence, Value,
    concatenate_datasets, load_dataset, load_from_disk,
)

TARGET_SR = 16000
MIN_S, MAX_S = CLIP_SECONDS

CORPUS_FEATURES = Features({
    "audio":    Sequence(Value("int16")),   # raw 16 kHz PCM; mel is computed in the collator
    "sentence": Value("string"),
    "language": Value("string"),
    "source":   Value("string"),
    # Stored rather than derived: reading it back is a scan of one float column,
    # whereas len() over the audio column would pull the entire waveform corpus
    # into RAM just to count samples.
    "seconds":  Value("float32"),
})

_TEXT_CANDIDATES = ["sentence", "text", "transcription", "transcript", "normalized_text"]

# Standard Buckwalter -> Arabic script (plus "^" for thaa, which the Arabic
# Speech Corpus uses alongside "v").
_BUCKWALTER = {
    "'": "\u0621", "|": "\u0622", ">": "\u0623", "&": "\u0624", "<": "\u0625", "}": "\u0626",
    "A": "\u0627", "b": "\u0628", "p": "\u0629", "t": "\u062a", "v": "\u062b", "^": "\u062b",
    "j": "\u062c", "H": "\u062d", "x": "\u062e", "d": "\u062f", "*": "\u0630", "r": "\u0631",
    "z": "\u0632", "s": "\u0633", "$": "\u0634", "S": "\u0635", "D": "\u0636", "T": "\u0637",
    "Z": "\u0638", "E": "\u0639", "g": "\u063a", "_": "\u0640", "f": "\u0641", "q": "\u0642",
    "k": "\u0643", "l": "\u0644", "m": "\u0645", "n": "\u0646", "h": "\u0647", "w": "\u0648",
    "Y": "\u0649", "y": "\u064a", "F": "\u064b", "N": "\u064c", "K": "\u064d", "a": "\u064e",
    "u": "\u064f", "i": "\u0650", "~": "\u0651", "o": "\u0652", "`": "\u0670", "{": "\u0671",
}
# Harakat/shadda/sukun/dagger alif. Arabic and Urdu ASR targets are
# conventionally undiacritized, and mixing a fully-diacritized corpus (the
# Arabic Speech Corpus) with undiacritized ones (FLEURS, Common Voice) would
# teach Whisper two competing spellings of the same words.
_ARABIC_DIACRITICS = dict.fromkeys(list(range(0x064B, 0x0653)) + [0x0670])


def buckwalter_to_arabic(text: str) -> str:
    return "".join(_BUCKWALTER.get(ch, ch) for ch in text)


def normalise_text(raw: str) -> str:
    """Whitespace/unicode cleanup only — Whisper is a cased, punctuated model,
    so lowercasing or stripping punctuation here would actively teach it to
    produce worse output than the base checkpoint."""
    if not raw:
        return ""
    text = unicodedata.normalize("NFKC", str(raw))
    text = "".join(ch for ch in text if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return " ".join(text.split()).strip()


def decode_audio(value, target_sr=TARGET_SR):
    """A {"bytes"|"path"} cell from Audio(decode=False) -> mono float32 at target_sr.

    Done here with soundfile + librosa instead of datasets' own decoder, which
    in datasets 4 means torchcodec — a package that has to match the exact torch
    build and would otherwise pull a CPU torch over Colab's CUDA one.
    """
    import librosa
    import soundfile as sf

    if value.get("bytes"):
        data, sr = sf.read(io.BytesIO(value["bytes"]), dtype="float32", always_2d=True)
    elif value.get("path"):
        from datasets.utils.file_utils import xopen
        with xopen(value["path"], "rb") as f:
            data, sr = sf.read(io.BytesIO(f.read()), dtype="float32", always_2d=True)
    else:
        raise ValueError("audio cell has neither bytes nor path")
    array = data.mean(axis=1)
    if sr != target_sr:
        array = librosa.resample(array, orig_sr=sr, target_sr=target_sr, res_type="soxr_hq")
    return np.ascontiguousarray(array, dtype=np.float32)


def _open_stream(path, config, split, revision):
    """load_dataset(streaming=True), retrying on the Hub's auto-converted
    Parquet branch. datasets 4 cannot run loader scripts and several canonical
    speech repos are still script-based — but the Hub publishes a Parquet
    conversion of every public dataset on refs/convert/parquet, so this retry
    rescues them without hardcoding which ones need it."""
    attempts = [revision] if revision else [None, PARQUET_BRANCH]
    last = None
    for rev in attempts:
        try:
            kwargs = dict(split=split, streaming=True, revision=rev)
            return load_dataset(path, config, **kwargs) if config else load_dataset(path, **kwargs)
        except Exception as e:
            last = e
            if rev != attempts[-1]:
                logger.info(f"    {path}: default revision unusable ({type(e).__name__}) "
                            f"- retrying on {PARQUET_BRANCH}")
    raise last


def stream_source(path, config, split, text_key, audio_key, budget_seconds, deadline_seconds,
                  language, source_name, revision=None, transliteration=None):
    """Yield normalised {audio,int16 / sentence / language / source} rows until
    the hour budget or the wall-clock deadline is hit.

    Module-level (not a closure) so datasets.Dataset.from_generator can
    fingerprint it deterministically and reuse the cached Arrow shard on the
    next run instead of re-streaming the whole thing.
    """
    ds = _open_stream(path, config, split, revision)
    ds = ds.cast_column(audio_key, Audio(decode=False))

    first = next(iter(ds.take(1)))
    # Auto-detect the transcript column for community datasets whose schema we
    # cannot pin ahead of time (Source.text_key == "AUTO").
    if text_key == "AUTO":
        text_key = next((c for c in _TEXT_CANDIDATES if c in first), None)
        if text_key is None:
            raise ValueError(f"no recognisable transcript column in {list(first.keys())}")

    started = time.time()
    kept_seconds = 0.0
    seen_hashes = set()

    for row in ds:
        if kept_seconds >= budget_seconds or (time.time() - started) > deadline_seconds:
            break

        sentence = row.get(text_key)
        if transliteration == "buckwalter" and sentence:
            sentence = buckwalter_to_arabic(str(sentence))
        sentence = normalise_text(sentence)
        if language in ("ar", "ur"):
            sentence = sentence.translate(_ARABIC_DIACRITICS)
        if len(sentence) < 2:
            continue

        # Exact-duplicate transcripts are common in scraped/synthetic corpora and
        # are pure wasted GPU time — the model sees the same target repeatedly.
        h = hash(sentence)
        if h in seen_hashes:
            continue

        try:
            array = decode_audio(row[audio_key])
        except Exception as e:
            logger.warning(f"  ! {source_name}: undecodable clip skipped ({type(e).__name__}: {e})")
            continue
        duration = len(array) / TARGET_SR
        if not (MIN_S <= duration <= MAX_S):
            continue

        seen_hashes.add(h)
        kept_seconds += duration
        yield {
            "audio": (np.clip(array, -1.0, 1.0) * 32767).astype(np.int16),
            "sentence": sentence,
            "language": language,
            "source": source_name,
            "seconds": duration,
        }


def build_source(src: Source, budget_seconds: float):
    """Materialise one source to an Arrow shard on Drive, or reuse the cached one.

    The cache key includes the budget, so raising HOURS_PER_LANGUAGE rebuilds
    only what actually needs more data.
    """
    shard = CORPUS_CACHE / f"{src.lang}__{src.name}__{int(budget_seconds)}s"
    if shard.exists():
        try:
            # Arrow memory-maps what it loads. Mapped straight off the Drive FUSE
            # mount, every shuffled read during training is a page fault into
            # Drive, and one slow/failed fetch kills the kernel with SIGBUS —
            # which Colab reports as "crashed for an unknown reason". Train from
            # a local-disk copy; Drive stays the durable backup.
            local = LOCAL_CORPUS / shard.name
            if not local.exists():
                tmp = LOCAL_CORPUS / (shard.name + ".tmp")
                shutil.rmtree(tmp, ignore_errors=True)
                shutil.copytree(shard, tmp)
                tmp.rename(local)
            cached = load_from_disk(str(local))
            logger.info(f"  = {src.lang}/{src.name}: {len(cached)} cached clips")
            return cached
        except Exception as e:
            logger.warning(f"  ! cached shard {shard.name} unreadable ({e}) — rebuilding")
            shutil.rmtree(shard, ignore_errors=True)
            shutil.rmtree(LOCAL_CORPUS / shard.name, ignore_errors=True)

    ds = Dataset.from_generator(
        stream_source,
        features=CORPUS_FEATURES,
        cache_dir=str(HF_CACHE),
        # Default buffers 1000 clips (up to 30 s each) in RAM before each flush;
        # 100 keeps the peak well under a free Colab's 12.7 GB.
        writer_batch_size=100,
        gen_kwargs=dict(
            path=src.path, config=src.config, split=src.split,
            text_key=src.text_key, audio_key=src.audio_key,
            budget_seconds=budget_seconds, deadline_seconds=MAX_MINUTES_PER_SOURCE * 60,
            language=src.lang, source_name=src.name,
            revision=src.revision, transliteration=src.transliteration,
        ),
    )
    if len(ds) == 0:
        raise RuntimeError("source yielded no usable clips")

    ds.save_to_disk(str(shard))
    return ds


shards, per_lang_seconds = [], {}

for lang in ACTIVE_LANGS:
    lang_sources = [s for s in SOURCES if s.lang == lang]
    if not lang_sources:
        logger.warning(f"[{lang}] no sources enabled — language dropped")
        continue

    total_weight = sum(s.weight for s in lang_sources)
    budget_total = HOURS_PER_LANGUAGE * 3600
    print(f"\n--- {lang}: {hhmm(budget_total)} across {len(lang_sources)} source(s) ---")

    unfilled = 0.0     # budget released by sources that failed or ran dry, redistributed onward
    for i, src in enumerate(lang_sources):
        remaining_sources = lang_sources[i:]
        share = budget_total * src.weight / total_weight + unfilled / max(len(remaining_sources), 1)
        try:
            ds = build_source(src, share)
            shards.append(ds)
            got = float(sum(ds["seconds"]))
            per_lang_seconds[lang] = per_lang_seconds.get(lang, 0.0) + got
            unfilled += max(share - got, 0.0)
            logger.info(f"  + {lang}/{src.name}: {len(ds)} clips, {hhmm(got)}")
        except Exception as e:
            unfilled += share
            logger.warning(f"  - SKIPPED {lang}/{src.name} — {type(e).__name__}: {e}")
        free_memory()

if not shards:
    raise RuntimeError(
        "Every dataset failed to load. Check the runtime's internet access and, if you enabled "
        "gated sources, that HF_TOKEN is set and you accepted their terms on the dataset pages."
    )

combined = concatenate_datasets(shards).shuffle(seed=42)
print("\n" + "=" * 72)
print(f"Corpus: {len(combined)} clips, {hhmm(sum(per_lang_seconds.values()))} of audio")
for lang in ACTIVE_LANGS:
    got = per_lang_seconds.get(lang, 0.0)
    flag = "  <-- EMPTY, this language will not be learned" if got == 0 else ""
    print(f"  {lang}: {hhmm(got):>8}{flag}")
print("=" * 72)
free_memory()


# ------------------------------------- 6. TOKENISE (stateless prefix tokens)
from transformers import (
    EarlyStoppingCallback,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperFeatureExtractor,
    WhisperForConditionalGeneration,
    WhisperProcessor,
    WhisperTokenizer,
)
from transformers.models.whisper.english_normalizer import BasicTextNormalizer

feature_extractor = WhisperFeatureExtractor.from_pretrained(WHISPER_MODEL)
tokenizer = WhisperTokenizer.from_pretrained(WHISPER_MODEL, task="transcribe")
processor = WhisperProcessor.from_pretrained(WHISPER_MODEL, task="transcribe")

# tokenizer.set_prefix_tokens() MUTATES the tokenizer, which is why the previous
# version of this notebook had to run its per-example map single-process — by
# far the slowest step in the whole run. Rather than hand-composing the prefix
# (and betting that <|xx|> lookup matches how Whisper actually derives the
# language token — internally it is an OFFSET from <|startoftranscript|>, not a
# name lookup), ask the tokenizer for each language's prefix ONCE here, while
# nothing is running concurrently, and cache the result. Exact by construction,
# and a plain list lookup afterwards, so the collator is safe in worker threads.
EOT_ID = tokenizer.eos_token_id
LANG_PREFIX: Dict[str, List[int]] = {}
for _lang in ACTIVE_LANGS:
    try:
        tokenizer.set_prefix_tokens(language=_lang, task="transcribe")
        LANG_PREFIX[_lang] = list(tokenizer.prefix_tokens)
    except ValueError as e:
        raise ValueError(f"Whisper does not support language '{_lang}': {e}") from e
print("Whisper prefix tokens:", {k: v for k, v in LANG_PREFIX.items()})


def build_labels(sentences, languages):
    """-> [<|sot|>, <|lang|>, <|transcribe|>, <|notimestamps|>, ...text..., <|eot|>]"""
    encoded = tokenizer(list(sentences), add_special_tokens=False).input_ids
    return [LANG_PREFIX[lang] + ids + [EOT_ID] for ids, lang in zip(encoded, languages)]


# Free Colab has 2 vCPUs and 12.7 GB RAM; every dataloader worker is a forked
# copy of this whole kernel, so more workers than cores only costs RAM.
NUM_PROC = min(2, os.cpu_count() or 1)

# Labels are built in the collator (section 7), not in a .map() over the corpus.
# A .map() here would rewrite every waveform to a second full copy on disk just
# to append a token-id column — roughly the size of the corpus again, and the
# slowest step in the notebook. The only thing that genuinely has to happen up
# front is dropping transcripts too long for Whisper's 448-token decoder window,
# and a character bound does that from the text column alone. 448 tokens is
# ~1500+ characters in every script here, so 900 discards nothing real; it just
# catches the pathological rows (concatenated transcripts, metadata dumps) that
# a 30 s clip could never actually contain.
before = len(combined)
# Single-process on purpose: it only reads the text column, so it is seconds of
# work, and forking a kernel that already holds a CUDA context plus
# hf_transfer's Rust threads is a classic source of silent worker deaths.
combined = combined.filter(lambda s: 2 <= len(s) <= 900, input_columns=["sentence"],
                           desc="Dropping over-long transcripts")
if len(combined) < before:
    logger.info(f"dropped {before - len(combined)} clips with unusable transcript lengths")

split = combined.train_test_split(test_size=min(0.05, 1000 / max(len(combined), 1)), seed=42)
datasets_ = DatasetDict({"train": split["train"], "eval": split["test"]})
print(datasets_)
free_memory()


# ----------------------------------------------------------- 7. COLLATOR
@dataclass
class WhisperCollator:
    """Turns int16 PCM into log-mel, and transcripts into label ids, on the fly.

    Both are done here rather than precomputed into the dataset. That keeps the
    cached corpus to exactly one copy of the audio on Drive (~5x smaller than
    storing float32 mels, and with no duplicate written by a tokenising map),
    and it costs nothing in wall-clock: `dataloader_num_workers` runs this on
    CPU while the GPU is still busy with the previous batch.
    """
    feature_extractor: Any
    decoder_start_token_id: int
    max_label_length: int = 448     # Whisper's decoder positional-embedding limit

    def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        waveforms = [np.asarray(f["audio"], dtype=np.float32) / 32768.0 for f in features]
        batch = self.feature_extractor(waveforms, sampling_rate=TARGET_SR, return_tensors="pt")

        label_ids = build_labels([f["sentence"] for f in features],
                                 [f["language"] for f in features])
        label_ids = [ids[: self.max_label_length] for ids in label_ids]

        max_len = max(len(ids) for ids in label_ids)
        labels = torch.full((len(label_ids), max_len), -100, dtype=torch.long)
        for i, ids in enumerate(label_ids):
            labels[i, : len(ids)] = torch.tensor(ids, dtype=torch.long)

        # Trainer builds decoder_input_ids by right-shifting labels and
        # prepending decoder_start_token_id, so the copy already sitting at
        # position 0 has to come off — otherwise the model is trained to emit it
        # twice and every transcription starts with a stray marker.
        if (labels[:, 0] == self.decoder_start_token_id).all():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch


# ------------------------------------------------------------ 8. METRICS
import jiwer   # used directly rather than through `evaluate`, which downloads a
               # loader script on every call and fails the run when offline

normaliser = BasicTextNormalizer()


def _score(preds, refs):
    """WER/CER over the pairs that survive normalisation (an empty reference
    makes jiwer raise, and would make the average meaningless anyway)."""
    pairs = [(normaliser(p), normaliser(r)) for p, r in zip(preds, refs)]
    pairs = [(p, r) for p, r in pairs if r.strip()]
    if not pairs:
        return {"wer": 100.0, "cer": 100.0}
    hyp, ref = [p for p, _ in pairs], [r for _, r in pairs]
    return {"wer": 100 * jiwer.wer(ref, hyp), "cer": 100 * jiwer.cer(ref, hyp)}


def compute_metrics(pred):
    label_ids = np.where(pred.label_ids != -100, pred.label_ids, tokenizer.pad_token_id)
    pred_str = tokenizer.batch_decode(pred.predictions, skip_special_tokens=True)
    label_str = tokenizer.batch_decode(label_ids, skip_special_tokens=True)
    return _score(pred_str, label_str)


# -------------------------------------------------------------- 9. MODEL
model = WhisperForConditionalGeneration.from_pretrained(WHISPER_MODEL)
model.generation_config.language = None          # multilingual: never pin one language
model.generation_config.task = "transcribe"
model.generation_config.forced_decoder_ids = None
model.config.forced_decoder_ids = None
model.config.suppress_tokens = []

if SPEC_AUGMENT and hasattr(model.config, "apply_spec_augment"):
    # Whisper's built-in SpecAugment. Applied inside the encoder and guarded by
    # `self.training`, so it is automatically off during eval/generation — which
    # is why this is preferable to masking by hand in the collator, where the
    # same collator instance serves both train and eval batches.
    model.config.apply_spec_augment = True
    model.config.mask_time_prob = 0.05
    model.config.mask_time_length = 10
    model.config.mask_feature_prob = 0.05
    model.config.mask_feature_length = 10

# Read off the plain model, before any LoRA wrapper hides it behind
# .base_model.model.
DECODER_START_ID = model.config.decoder_start_token_id

if USE_LORA:
    from peft import LoraConfig, get_peft_model
    model.enable_input_require_grads()   # required for gradient checkpointing + LoRA
    model = get_peft_model(model, LoraConfig(
        r=32, lora_alpha=64, lora_dropout=0.05, bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "out_proj", "fc1", "fc2"],
    ))
    model.print_trainable_parameters()

data_collator = WhisperCollator(
    feature_extractor=processor.feature_extractor,
    decoder_start_token_id=DECODER_START_ID,
)


# ------------------------------------------------------------- 10. TRAIN
# whisper-small activations fit 8/step on a 15 GB T4; anything bigger gets the
# headroom it needs from gradient accumulation instead, so the EFFECTIVE batch
# stays at 32 regardless of which GPU Colab hands out.
_size_factor = 2 if "small" in WHISPER_MODEL or "base" in WHISPER_MODEL else 1
BATCH_SIZE = max(1, int((4 if GPU_MEM_GB < 20 else 12) * _size_factor))
GRAD_ACCUM = max(1, 32 // BATCH_SIZE)
print(f"batch {BATCH_SIZE} x accum {GRAD_ACCUM} = effective {BATCH_SIZE * GRAD_ACCUM}")

training_args = Seq2SeqTrainingArguments(
    output_dir=str(OUTPUT_DIR),
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LEARNING_RATE,
    warmup_ratio=WARMUP_RATIO,
    num_train_epochs=NUM_EPOCHS,
    max_steps=30 if SMOKE_TEST else -1,
    gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False},
    bf16=SUPPORTS_BF16,
    fp16=not SUPPORTS_BF16,
    eval_strategy="steps",
    eval_steps=EVAL_STEPS,
    save_strategy="steps",
    save_steps=SAVE_STEPS,
    save_total_limit=2,
    logging_steps=25,
    predict_with_generate=True,
    generation_max_length=225,
    load_best_model_at_end=True,
    metric_for_best_model="wer",
    greater_is_better=False,
    dataloader_num_workers=NUM_PROC,
    dataloader_pin_memory=True,
    group_by_length=False,        # Whisper pads every clip to a fixed 30 s window,
                                  # so length grouping buys nothing here
    label_names=["labels"],       # required, and silently wrong by default, under LoRA
    report_to=["tensorboard"],
    remove_unused_columns=False,
    push_to_hub=False,
)

# Trainer's `tokenizer` argument was renamed to `processing_class` partway
# through transformers 4.x and the old spelling then removed, so hardcoding
# either one breaks on half of the >=4.44,<5 range this cell allows. Ask the
# installed signature which it has.
_feat_kwarg = ("processing_class"
               if "processing_class" in inspect.signature(Seq2SeqTrainer.__init__).parameters
               else "tokenizer")

trainer = Seq2SeqTrainer(
    args=training_args,
    model=model,
    train_dataset=datasets_["train"],
    eval_dataset=datasets_["eval"],
    data_collator=data_collator,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    **{_feat_kwarg: processor.feature_extractor},
)

trained_cleanly = False
if RUN_TRAINING:
    resume = last_checkpoint(OUTPUT_DIR)
    print(f"\n{'Resuming from ' + resume.name if resume else 'Starting fresh'}\n")
    try:
        trainer.train(resume_from_checkpoint=str(resume) if resume else None)
        trained_cleanly = True   # load_best_model_at_end has put the BEST weights in `model`
    except KeyboardInterrupt:
        print("\nInterrupted. The last checkpoint on Drive is intact — re-run this cell to "
              "resume, or read on: the export/eval below will use it as-is.")
    free_memory()


# ------------------------------------------------------ 11. EXPORT + EVALUATE
# Only reload from disk when training did NOT finish cleanly. After a clean
# finish `model` already holds the BEST checkpoint (load_best_model_at_end swaps
# it in), which is not necessarily the highest-numbered checkpoint-N on disk —
# reloading here would silently downgrade to a worse, later one.
if not trained_cleanly:
    ckpt = last_checkpoint(OUTPUT_DIR)
    if ckpt is not None:
        print(f"Loading {ckpt} from disk for export")
        if USE_LORA:
            from peft import PeftModel
            base = WhisperForConditionalGeneration.from_pretrained(WHISPER_MODEL)
            model = PeftModel.from_pretrained(base, str(ckpt))
        else:
            model = WhisperForConditionalGeneration.from_pretrained(str(ckpt))
    elif not RUN_TRAINING:
        raise RuntimeError("RUN_TRAINING=False and no checkpoint exists yet — nothing to export.")
    else:
        logger.warning("Interrupted before the first checkpoint — exporting the untrained base "
                       "model as a placeholder. Re-run to actually train it.")

if USE_LORA:
    # Fold the adapters into the base weights so the export is a plain
    # WhisperForConditionalGeneration. stt-tts-service loads it with
    # from_pretrained() and must not need peft installed to do so.
    model = model.merge_and_unload()

model = model.to("cuda").eval()
model.save_pretrained(str(FINAL_DIR))
processor.save_pretrained(str(FINAL_DIR))
print(f"\nFinal model saved to {FINAL_DIR}")
print("  -> copy this folder to stt-tts-service/models/stt_model_final/")
free_memory()


# ---------------------------------------- 12. PER-LANGUAGE REPORT + PREVIEW
# Trainer's own eval reports one blended WER over every language at once, which
# hides the case that actually matters here: one language (usually Urdu, the
# thinnest corpus) being far worse than the blended figure suggests.
if RUN_PREVIEW:
    report = {}
    eval_ds = datasets_["eval"]

    for lang in ACTIVE_LANGS:
        subset = eval_ds.filter(lambda x: x == lang, input_columns=["language"])
        if len(subset) == 0:
            continue
        subset = subset.select(range(min(len(subset), 64)))

        preds, refs = [], []
        for start in range(0, len(subset), 8):
            chunk = [subset[i] for i in range(start, min(start + 8, len(subset)))]
            waveforms = [np.asarray(r["audio"], dtype=np.float32) / 32768.0 for r in chunk]
            feats = feature_extractor(waveforms, sampling_rate=TARGET_SR,
                                      return_tensors="pt").input_features.to(model.device, model.dtype)
            with torch.no_grad():
                ids = model.generate(feats, language=lang, task="transcribe", max_new_tokens=225)
            preds += tokenizer.batch_decode(ids, skip_special_tokens=True)
            refs += [r["sentence"] for r in chunk]

        report[lang] = {**_score(preds, refs), "n": len(subset)}
        print(f"\n[{lang}]  WER {report[lang]['wer']:.1f}%  CER {report[lang]['cer']:.1f}%  (n={len(subset)})")
        print(f"  REFERENCE : {refs[0]}")
        print(f"  PREDICTED : {preds[0]}")
        free_memory()

    with open(FINAL_DIR / "eval_metrics.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nPer-language metrics written to {FINAL_DIR / 'eval_metrics.json'}")


# ------------------------------------ 13. THE INFERENCE WRAPPER THE API USES
class MultilingualSTT:
    """Loads the exported checkpoint and transcribes audio.

    This is the same code path python-services/stt-tts-service/main.py runs, so
    what you hear here is what the API returns. `language=None` lets Whisper
    detect the language itself, which is the right default for a call where the
    caller's language is not known up front.
    """

    def __init__(self, model_dir, device=None):
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = WhisperProcessor.from_pretrained(str(model_dir))
        self.model = WhisperForConditionalGeneration.from_pretrained(str(model_dir)).to(self.device).eval()

    def transcribe(self, audio, sampling_rate=16000, language=None):
        """audio: 1-D float array in [-1, 1], a file path, or WAV/MP3 bytes."""
        if isinstance(audio, (str, Path, bytes)):
            import librosa
            source = io.BytesIO(audio) if isinstance(audio, bytes) else str(audio)
            audio, sampling_rate = librosa.load(source, sr=TARGET_SR, mono=True)
        elif sampling_rate != TARGET_SR:
            import librosa
            audio = librosa.resample(np.asarray(audio, dtype=np.float32),
                                     orig_sr=sampling_rate, target_sr=TARGET_SR)

        features = self.processor.feature_extractor(
            np.asarray(audio, dtype=np.float32), sampling_rate=TARGET_SR, return_tensors="pt"
        ).input_features.to(self.device)

        # `language=`/`task=` kwargs, not forced_decoder_ids: the latter is
        # deprecated on Whisper's generate() and conflicts with generation_config.
        kwargs = {"task": "transcribe", "max_new_tokens": 225}
        if language:
            kwargs["language"] = language
        with torch.no_grad():
            ids = self.model.generate(features, **kwargs)
        return self.processor.tokenizer.batch_decode(ids, skip_special_tokens=True)[0].strip()


# Example:
#   stt = MultilingualSTT(FINAL_DIR)
#   print(stt.transcribe("/content/sample.wav", language="ur"))
print("\nDone. MultilingualSTT is ready — see the example at the bottom of this cell.")
