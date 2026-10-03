# =============================================================================
#  MULTILINGUAL TTS (VITS / MMS) FINE-TUNING — ONE SELF-CONTAINED COLAB CELL
#  Marketing Automation FYP
#
#  Paste this whole file into ONE Colab cell and run it. Nothing to clone,
#  compile, convert or read alongside it: the pip requirements, the dataset
#  catalogue, the romanizer, the monotonic-alignment kernel, the HiFi-GAN
#  discriminator, the full VITS training loop and the inference wrapper the
#  backend uses are all in this single file.
#
#  ---------------------------------------------------------------------------
#  WHAT IT PRODUCES
#  ---------------------------------------------------------------------------
#  One fine-tuned VITS voice PER LANGUAGE, each exported as a plain
#  transformers VitsModel + tokenizer:
#
#    <DRIVE_ROOT>/tts_model_final/<lang>/    <- copy to stt-tts-service/models/
#
#  This mirrors how Meta's own MMS project scales to 1100+ languages: no shared
#  decoder, one expert VITS per language. It is also the only realistic free
#  path that actually covers Urdu — Coqui XTTS-v2 and most other free
#  multilingual TTS stacks do not.
#
#  ---------------------------------------------------------------------------
#  WHY THIS FILE NO LONGER CLONES finetune-hf-vits
#  ---------------------------------------------------------------------------
#  The previous version drove training through a GitHub repo, which meant a
#  Cython monotonic_align build, a perl uroman checkout, a separate
#  discriminator-conversion script, and a JSON config handed to a subprocess.
#  Four external moving parts, three of which were the documented failure modes
#  in this project's own notes, and all of which put the training loop out of
#  reach of any change worth making.
#
#  Everything is inlined here instead:
#    * the generator IS transformers' own VitsModel — the architecture is not
#      reimplemented, only the training-time forward path around it, which
#      transformers does not expose (VitsModel.forward is inference-only, but
#      it does carry the posterior_encoder that training needs);
#    * monotonic alignment search is a numba kernel, so no Cython, no compiler;
#    * the HiFi-GAN multi-period/multi-scale discriminator is defined below, so
#      no conversion script and no torch.load weights_only workaround;
#    * romanization uses the pure-Python `uroman` package, so no perl.
#
#  The one thing lost with the conversion script is MMS's PRETRAINED
#  discriminator — ours starts from random init. ADV_WARMUP_STEPS below is the
#  answer: the adversarial and feature-matching terms ramp in from zero while
#  the discriminator learns what real audio looks like, so a random critic
#  never gets to push garbage gradients into a good generator. Reconstruction
#  (mel), KL and duration losses carry training from step 1 either way.
#
#  ---------------------------------------------------------------------------
#  REQUIREMENTS (installed automatically by section 1 — nothing to run by hand)
#  ---------------------------------------------------------------------------
#    transformers>=4.44.2,<5   datasets>=4.4,<5   dill>=0.4.1   numba
#    uroman                    librosa            soundfile
#    tensorboard               hf_transfer
#  RANGES, not exact pins, on purpose. tokenizers==0.19.1 (what an exact
#  transformers==4.44.2 pin drags in) only publishes wheels up to Python 3.12;
#  on Colab's newer Python pip falls back to compiling it from Rust source,
#  that build fails, and the old version of this cell then killed the kernel
#  anyway — an endless crash/restart loop. The ranges let pip pick the newest
#  4.x transformers + tokenizers with prebuilt wheels for whatever Python Colab
#  runs. transformers stays below 5 because 5 reworked the model internals
#  this trainer wires into. datasets must be >=4.4: 3.x caps dill below 0.3.9,
#  which cannot pickle on Python 3.14, and datasets fingerprints (pickles)
#  every Dataset it builds. datasets 4 has no loader scripts, so every corpus
#  below is a Parquet/Arrow repo, and audio is decoded here with soundfile +
#  librosa (Audio(decode=False)) — deliberately NOT datasets[audio], whose
#  torchcodec dependency must match the exact torch build and would otherwise
#  drag a different torch over Colab's CUDA one.
#  Colab already ships a CUDA torch build — torch is deliberately NOT pinned or
#  reinstalled, that only ever breaks the CUDA pairing. VitsModel's saved
#  format is unchanged across 4.x, so an exported voice still loads under the
#  transformers==4.44.2 in stt-tts-service/requirements.txt.
#
#  ---------------------------------------------------------------------------
#  BEFORE THE FIRST RUN (one time, ~2 minutes)
#  ---------------------------------------------------------------------------
#   1. Runtime > Change runtime type > T4 GPU.
#   2. Colab left sidebar > key icon ("Secrets") > "+ Add new secret"
#        Name:  HF_TOKEN
#        Value: a token from https://huggingface.co/settings/tokens (READ is enough)
#      then flip "Notebook access" ON. Optional — only the gated Urdu corpus
#      needs it; every other language trains without a token.
#   3. Only for Urdu: visit https://huggingface.co/datasets/humairawan/Urdu-aud01
#      once and click "Agree and access repository".
#
#  ---------------------------------------------------------------------------
#  DATASET CATALOGUE  (the registry in section 5 is the executable version)
#  ---------------------------------------------------------------------------
#  TTS wants CLEAN and FEW-SPEAKER audio — the opposite of what ASR wants. A
#  corpus with 500 speakers teaches VITS the average of 500 voices, which is
#  what makes a fine-tune sound muddier than the base checkpoint it started
#  from. Where only multi-speaker audio exists for a language, `speaker_key`
#  below pins training to ONE speaker out of it (section 6), which is what
#  makes German/French/Spanish usable at all here.
#
#   Lang | Dataset              | HF id / config                          | Speakers
#   -----+----------------------+------------------------------------------+----------
#   en   | LJSpeech             | MikhailT/lj-speech  (parquet mirror)     | 1 (studio)
#   ar   | Arabic Speech Corpus | tunis-ai/arabic_speech_corpus (parquet)  | 1 (MSA)
#   ar   | ClArTTS              | MBZUAI/ClArTTS                           | 1 (classical)
#   ur   | Urdu-aud01           | humairawan/Urdu-aud01           [gated]  | few (synthetic)
#   ur   | FLEURS               | google/fleurs  ur_pk                     | mixed
#   de   | VoxPopuli            | facebook/voxpopuli  de                   | pinned to 1
#   de   | FLEURS               | google/fleurs  de_de                     | mixed
#   fr   | VoxPopuli            | facebook/voxpopuli  fr                   | pinned to 1
#   fr   | FLEURS               | google/fleurs  fr_fr                     | mixed
#   es   | VoxPopuli            | facebook/voxpopuli  es                   | pinned to 1
#   es   | FLEURS               | google/fleurs  es_419                    | mixed
#   hi   | FLEURS               | google/fleurs  hi_in                     | mixed
#  FLEURS is read from its auto-converted Parquet branch (refs/convert/parquet)
#  because its main branch is raw tsv + tar.gz. It has no speaker-id column, so
#  it cannot be pinned; it carries a lower weight where a pinned source exists.
#
#  Base checkpoints (Apache-2.0 / MIT, ungated). Each language tries its list
#  in order, so a renamed or newly-gated repo degrades to the next one instead
#  of failing the language:
#    en  facebook/mms-tts-eng   (kakao-enterprise/vits-ljs is NOT used: its
#        tokenizer has phonemize=true, which needs the phonemizer package AND
#        the espeak-ng system binary at train time and in the API container)
#    ur  facebook/mms-tts-urd-script_arabic
#    ar  facebook/mms-tts-ara     de  facebook/mms-tts-deu
#    fr  facebook/mms-tts-fra     es  facebook/mms-tts-spa
#    hi  facebook/mms-tts-hin
#  MMS covers 1100+ languages as facebook/mms-tts-<iso639-3>; look an 8th
#  language up at https://huggingface.co/facebook/mms-tts before adding it.
#
#  ---------------------------------------------------------------------------
#  EFFICIENCY: STREAMING + AN HOURS BUDGET + int16 CACHING
#  ---------------------------------------------------------------------------
#  Every corpus is opened with streaming=True and read only until that
#  language's hour budget is filled, so disk and wall-clock scale with what we
#  train on rather than with whatever upstream publishes — VoxPopuli alone is
#  tens of GB to fetch in full for the ~2 h we actually want. What survives is
#  cached to Drive as int16 PCM (about a fifth of the size of cached float32
#  spectrograms) and spectrograms are computed on GPU per batch, which is
#  faster than reading precomputed ones back off Drive anyway.
#
#  ---------------------------------------------------------------------------
#  RESUME BEHAVIOUR — re-running this cell is ALWAYS safe
#  ---------------------------------------------------------------------------
#  * pip install: skipped when the pinned versions are already importable.
#  * corpus: cached per (source, budget) on Drive and reused verbatim.
#  * training: each language checkpoints generator + discriminator + both
#    optimizers + step count to LOCAL disk every SAVE_EVERY steps; when the
#    language stops (finished, interrupted or failed) its newest checkpoint is
#    copied to Drive's tts_vits_checkpoints/<lang>/, and the next run picks up
#    whichever of the two is newer. A runtime disconnect mid-language loses
#    that language's progress since its last persisted checkpoint — not
#    the other languages.
#  * export: staged locally, reloaded to prove the weights are complete, then
#    copied to Drive and size-checked file by file; the cell ends by flushing
#    Drive so the 145 MB weight files are really uploaded.
#  Interrupt during a language: that language keeps its checkpoint and the cell
#  moves to the next one. Interrupt again within 3 s to stop training entirely
#  and jump to the preview/export stage.
#
#  BEFORE A RUN: empty Drive Trash. Files deleted through the Colab Drive
#  mount go to Trash and still count against the 15 GB quota.
#
#  START HERE: leave SMOKE_TEST=True for the first run. It trains ~40 steps on
#  a few minutes of audio and exports a (bad, but valid) voice, which proves
#  the whole path end to end in ~10 minutes instead of finding out six hours in.
# =============================================================================

# ----------------------------------------------------------------- SETTINGS
HF_TOKEN_SECRET = "HF_TOKEN"
RUN_SETUP       = True     # pip install (auto-skips when already satisfied)
RUN_TRAINING    = True     # False = only preview/export existing checkpoints
RUN_PREVIEW     = True     # listen to a sample per language + export final voices
SMOKE_TEST      = True     # <- flip to False for a real run (see note above)
TRAIN_ONLY      = []       # e.g. ["ur"] to train one language; [] = all enabled

LANGUAGES = {
    "en": True,
    "ur": True,
    "ar": True,
    "de": True,
    "fr": True,    # optional — set False to drop
    "es": True,    # optional — set False to drop
    "hi": True,    # optional — set False to drop
}

# Corpus budget, in hours of audio per language. VITS fine-tuning converges on
# far less data than ASR: 1-3 h of CLEAN single-speaker audio beats 20 h of
# mixed-speaker audio, so more here is not automatically better.
HOURS_PER_LANGUAGE     = 2.0
MAX_MINUTES_PER_SOURCE = 12.0        # wall-clock guard on a slow stream
CLIP_SECONDS           = (1.0, 11.0) # VITS trains on short utterances; long ones only cost memory
MAX_TEXT_TOKENS        = 400
MAX_CHARS_PER_SECOND   = 20.0        # drops clips whose transcript cannot fit the audio (see section 6)

# Training. STEPS_PER_LANGUAGE is the real knob: VITS improves smoothly and has
# no natural stopping point, so this is a time budget, not a convergence
# criterion. ~2000 steps per language is a decent free-tier session; listen to
# the previews and raise it for whichever voices still sound rough.
STEPS_PER_LANGUAGE = 2000
BATCH_SIZE         = 8            # drop to 4 on OOM
LEARNING_RATE      = 2e-5
# v1 (300-step warmup, everything trainable) made EVERY voice less
# intelligible than its base in eval_tts.py's TTS->Whisper round trip — e.g.
# en 8% -> 25% WER, de 28% -> 57%. Two changes target that:
#  * the random-init discriminator gets 1000 steps, not 300, to become a
#    useful critic before its gradients reach the generator;
#  * the text encoder and duration predictor are frozen. They hold what MMS
#    learned about pronunciation and timing from far more data than our ~2 h,
#    and fine-tuning only needs the acoustic side (posterior encoder, flow,
#    HiFi-GAN decoder) to move toward the new recordings.
ADV_WARMUP_STEPS   = 1000         # adversarial + feature-matching ramp in over this many steps
FREEZE_TEXT_SIDE   = True         # freeze text_encoder + duration_predictor
# Checkpoints are kept per run, so a recipe change starts fresh instead of
# resuming a checkpoint trained the old way (or with a different optimizer
# param set, which would not even load). Bump this for every new recipe.
RUN_NAME           = "v2_frozen_text"
SAVE_EVERY         = 250
LOG_EVERY          = 25
EVAL_EVERY         = 250
SEGMENT_FRAMES     = 32           # decoder trains on 32 spectrogram frames (~0.5 s at 16 kHz)

# Loss weights — the VITS paper's values, unchanged.
C_MEL, C_KL, C_FM, C_ADV, C_DUR = 45.0, 1.0, 2.0, 1.0, 1.0

# =============================================================================

import os
import gc
import json
import time
import shutil
import logging
import math
import subprocess
import sys
import unicodedata
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

# force=True: Colab's kernel pre-installs a root handler, which otherwise makes
# basicConfig a silent no-op and hides every logger.info below.
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", force=True)
logger = logging.getLogger("tts")
logging.getLogger("datasets").setLevel(logging.ERROR)


def sh(cmd, cwd=None, check=False):
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


def hhmm(seconds):
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
REQUIREMENTS = [
    ("transformers>=4.44.2,<5",       "transformers", (4, 44, 2), (5,)),
    ("datasets>=4.4.0,<5",            "datasets",     (4, 4, 0),  (5,)),
    # datasets' own range still admits dill 0.3.8, and pip keeps whatever is
    # already installed when it satisfies the range — but dill < 0.4.1 cannot
    # pickle on Python 3.14, and datasets pickles every Dataset it creates.
    ("dill>=0.4.1",                   "dill",         (0, 4, 1),  None),
    ("multiprocess>=0.70.19",         "multiprocess", (0, 70, 19), None),
    ("numba",       "numba",       None, None),
    ("uroman",      "uroman",      None, None),
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
    probe = "from transformers import VitsModel, AutoTokenizer; import datasets, tokenizers"
    return subprocess.run([sys.executable, "-c", probe], capture_output=True).returncode == 0


if RUN_SETUP:
    to_install = _missing_requirements()
    if not to_install and not _stack_imports_cleanly():
        to_install = [spec for spec, dist, _, _ in REQUIREMENTS
                      if dist in ("transformers", "datasets")]
    if to_install:
        print("Installing:", ", ".join(to_install))
        # --prefer-binary: never try to compile a Rust/C extension from source
        # when any wheel will do. That source build is exactly what crashed the
        # previous version of this cell on Colab.
        quoted = " ".join(f'"{s}"' for s in to_install)
        code = sh(f'"{sys.executable}" -m pip install -q --prefer-binary {quoted}')
        if code != 0 or _missing_requirements() or not _stack_imports_cleanly():
            # Stop HERE, with the kernel alive and pip's error above. Killing the
            # kernel after a FAILED install is what produced the endless
            # crash/restart loop: every re-run retried the same failing install.
            raise RuntimeError(
                f"pip install failed (exit code {code}) — scroll up for pip's own error. "
                f"The kernel was NOT restarted. Still missing: {_missing_requirements() or 'import check failed'}"
            )
        # Python has already imported the old modules (Colab preloads some of
        # them), so the running kernel cannot pick up the new versions — the
        # process is replaced. Only reached after a SUCCESSFUL install.
        print("\n" + "=" * 72)
        print("  Dependencies installed. The kernel must restart to pick them up.")
        print("  Restarting now — just RUN THIS SAME CELL AGAIN afterwards.")
        print("  The second run skips setup and goes straight to the corpus build.")
        print("=" * 72)
        time.sleep(1)  # let the messages above flush to the notebook first
        os.kill(os.getpid(), 9)
    logger.info("dependencies already satisfied — skipping pip install and restart")

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
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
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

if not torch.cuda.is_available():
    raise RuntimeError(
        "No GPU attached. Runtime > Change runtime type > T4 GPU, then re-run this cell. "
        "VITS fine-tuning on CPU is not viable."
    )

GPU_MEM_GB = torch.cuda.get_device_properties(0).total_memory / 1e9
print(f"GPU: {torch.cuda.get_device_name(0)}  ({GPU_MEM_GB:.0f} GB)")


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
        f"No Hugging Face token (Colab secret '{HF_TOKEN_SECRET}' not set). humairawan/Urdu-aud01 "
        f"is gated and will be skipped; Urdu falls back to its ungated source and every other "
        f"language is unaffected."
    )


# --------------------------------------------------------------- 3. PATHS
DRIVE_ROOT = (Path("/content/drive/MyDrive/marketing_fyp_speech")
              if Path("/content/drive/MyDrive").exists() else Path("./marketing_fyp_speech"))
TTS_CKPT_ROOT  = DRIVE_ROOT / "tts_vits_checkpoints" / RUN_NAME   # ONE durable checkpoint per language
TTS_FINAL_ROOT = DRIVE_ROOT / "tts_model_final"
CORPUS_CACHE   = DRIVE_ROOT / "tts_corpus_cache"
# Scratch for HF's own download/Arrow intermediates: local VM disk, not Drive.
# These are rebuildable from the durable shards, and Drive is both slower and
# quota-limited, so parking throwaway Arrow files there wastes both.
HF_CACHE = Path("/content/hf_cache") if Path("/content").exists() else DRIVE_ROOT / "hf_cache"
# Rolling training checkpoints live on LOCAL VM disk too. Each one holds the
# generator, discriminator and both AdamW states (~0.9 GB), and one is written
# every SAVE_EVERY steps. Writing those to Drive and deleting the old ones
# does NOT free quota: a file deleted through the Drive mount goes to Drive
# Trash, which still counts. Seven languages of that fills a free 15 GB Drive,
# after which the small export files still land but the 145 MB
# model.safetensors silently does not. Only the newest checkpoint of each
# language is copied to Drive, once, when that language stops training.
LOCAL_ROOT = Path("/content") if Path("/content").exists() else DRIVE_ROOT / "local"
LOCAL_CKPT_ROOT   = LOCAL_ROOT / "tts_vits_checkpoints" / RUN_NAME
LOCAL_EXPORT_ROOT = LOCAL_ROOT / "tts_model_final"      # staged + verified before Drive
for p in (TTS_CKPT_ROOT, TTS_FINAL_ROOT, CORPUS_CACHE, HF_CACHE, LOCAL_CKPT_ROOT, LOCAL_EXPORT_ROOT):
    p.mkdir(parents=True, exist_ok=True)

try:
    _drive_free_gb = shutil.disk_usage(str(DRIVE_ROOT)).free / 1e9
    print(f"Drive free  : {_drive_free_gb:.1f} GB (as reported by the mount)")
    if _drive_free_gb < 3:
        logger.warning(
            f"Only {_drive_free_gb:.1f} GB free on Drive. Exports need ~150 MB per language plus "
            f"~0.9 GB per persisted checkpoint. Empty Drive Trash (drive.google.com/drive/trash) "
            f"and delete old tts_vits_checkpoints/ before training, or the weights will not land."
        )
except OSError:
    pass

ACTIVE_LANGS = [c for c, on in LANGUAGES.items() if on]

if SMOKE_TEST:
    HOURS_PER_LANGUAGE = 0.05
    MAX_MINUTES_PER_SOURCE = 1.5
    STEPS_PER_LANGUAGE = 40
    SAVE_EVERY = EVAL_EVERY = 20
    ADV_WARMUP_STEPS = 10
    logger.warning("SMOKE_TEST=True — a few minutes of audio and ~40 steps per language. "
                   "The voices WILL sound bad; this only proves the pipeline. Set it False for a real run.")

print(f"Languages   : {ACTIVE_LANGS}")
print(f"Budget      : {HOURS_PER_LANGUAGE} h per language, {STEPS_PER_LANGUAGE} steps per language")
print(f"Checkpoints : {TTS_CKPT_ROOT}")


# ----------------------------------------------------- 4. TEXT FRONT-END
# Some MMS checkpoints were trained on ROMANIZED text and their
# tokenizer_config.json says so with is_uroman: true; feeding those native
# script silently produces near-noise. The flag is read per checkpoint, never
# assumed per language: the bases used here for Arabic, Urdu and Hindi
# (mms-tts-ara, mms-tts-urd-script_arabic, mms-tts-hin) all have
# is_uroman: false and native-script vocabularies, so they get native text.
# Whatever is decided has to match at train AND inference time — which is why
# the same helper is exported with the model wrapper at the bottom of this file.
_UROMAN_IMPL = None


def _init_uroman():
    """Resolve a romanizer once: pure-Python `uroman` package, else a perl
    uroman checkout via $UROMAN, else nothing. The Python package is the reason
    this file no longer clones a perl repo."""
    global _UROMAN_IMPL
    if _UROMAN_IMPL is not None:
        return _UROMAN_IMPL
    try:
        import uroman as _uroman_pkg
        instance = _uroman_pkg.Uroman()
        _UROMAN_IMPL = ("python", instance)
        logger.info("romanizer: uroman (pure Python)")
        return _UROMAN_IMPL
    except Exception as e:
        logger.warning(f"python uroman unavailable ({type(e).__name__}: {e})")

    perl_root = os.environ.get("UROMAN")
    if perl_root and (Path(perl_root) / "bin" / "uroman.pl").exists():
        _UROMAN_IMPL = ("perl", str(Path(perl_root) / "bin" / "uroman.pl"))
        logger.info("romanizer: uroman.pl via $UROMAN")
        return _UROMAN_IMPL

    _UROMAN_IMPL = ("none", None)
    return _UROMAN_IMPL


# uroman romanizes better when told the source language (it disambiguates
# script-specific rules, e.g. Urdu vs Arabic use of the same letters), so pass
# the ISO 639-3 code wherever we know it.
UROMAN_LCODE = {"ar": "ara", "ur": "urd", "hi": "hin", "en": "eng",
                "de": "deu", "fr": "fra", "es": "spa"}


def uromanize(text: str, lcode: Optional[str] = None) -> str:
    kind, impl = _init_uroman()
    if kind == "python":
        return impl.romanize_string(text, lcode=lcode).strip()
    if kind == "perl":
        cmd = ["perl", impl] + (["-l", lcode] if lcode else [])
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = proc.communicate(input=text.encode())
        if proc.returncode != 0:
            raise ValueError(f"uroman.pl failed ({proc.returncode}): {err.decode()}")
        return out.decode().strip()
    raise RuntimeError(
        "This voice needs uroman romanization but no romanizer is available. "
        "Run: pip install uroman   (or clone https://github.com/isi-nlp/uroman and set $UROMAN)."
    )


def tokenizer_is_uroman(*dirs) -> bool:
    """Read is_uroman off the first tokenizer_config.json that has one."""
    for d in dirs:
        if d is None:
            continue
        p = Path(d) / "tokenizer_config.json"
        if p.exists():
            try:
                with open(p, encoding="utf-8") as f:
                    return bool(json.load(f).get("is_uroman", False))
            except Exception:
                continue
    return False


SAMPLE_TEXT = {
    "en": "This is a preview of the fine tuned marketing voice assistant.",
    "de": "Dies ist eine Vorschau der trainierten Marketingsprachassistentin.",
    "ar": "هذه معاينة لمساعد التسويق الصوتي المدرب.",
    "ur": "یہ تربیت یافتہ مارکیٹنگ صوتی معاون کا ایک پیش نظارہ ہے۔",
    "fr": "Ceci est un aperçu de l'assistant vocal marketing entraîné.",
    "es": "Esta es una vista previa del asistente de voz de marketing entrenado.",
    "hi": "यह प्रशिक्षित मार्केटिंग वॉइस असिस्टेंट का एक पूर्वावलोकन है।",
}


def normalise_text(raw) -> str:
    if not raw:
        return ""
    text = unicodedata.normalize("NFKC", str(raw))
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    return " ".join(text.split()).strip()


# -------------------------------------------------- 5. THE DATASET REGISTRY
@dataclass
class Source:
    lang: str
    name: str
    path: str
    config: Optional[str] = None
    split: str = "train"
    text_key: str = "text"
    audio_key: str = "audio"
    speaker_key: Optional[str] = None   # pin to one speaker; see section 6
    weight: float = 1.0
    gated: bool = False
    revision: Optional[str] = None      # e.g. the auto-converted Parquet branch
    transliteration: Optional[str] = None  # "buckwalter": transcript is ASCII-encoded Arabic


# FLEURS' main branch is tsv + tar.gz; the Hub's own Parquet conversion is what
# datasets 4 can stream.
FLEURS_PARQUET = "refs/convert/parquet"

REGISTRY: List[Source] = [
    # keithito/lj_speech and halabi2016/arabic_speech_corpus are loader-script
    # repos, which datasets 4 cannot run; these are Parquet copies of the same audio.
    Source("en", "LJSpeech",  "MikhailT/lj-speech", None, "full", "normalized_text"),
    # Its transcripts are Buckwalter transliteration ("waraj~aHa Alt~aqoriyru"),
    # not Arabic script, so they are converted back before uroman sees them —
    # the MMS Arabic vocabulary is Arabic script, not Buckwalter ASCII.
    # "orthographic" is the clean spelling; "text" carries phonetic respellings.
    Source("ar", "ArabicSpeechCorpus", "tunis-ai/arabic_speech_corpus", None, "train",
           "orthographic", transliteration="buckwalter"),
    Source("ar", "ClArTTS",   "MBZUAI/ClArTTS", None, "train", "AUTO", weight=0.8),
    Source("ur", "Urdu-aud01", "humairawan/Urdu-aud01", None, "train", "text", gated=True),
    Source("ur", "FLEURS",    "google/fleurs", "ur_pk", "train", "transcription",
           revision=FLEURS_PARQUET, weight=0.6),
    Source("de", "VoxPopuli", "facebook/voxpopuli", "de", "train", "normalized_text",
           speaker_key="speaker_id"),
    Source("de", "FLEURS",    "google/fleurs", "de_de", "train", "transcription",
           revision=FLEURS_PARQUET, weight=0.5),
    Source("fr", "VoxPopuli", "facebook/voxpopuli", "fr", "train", "normalized_text",
           speaker_key="speaker_id"),
    Source("fr", "FLEURS",    "google/fleurs", "fr_fr", "train", "transcription",
           revision=FLEURS_PARQUET, weight=0.5),
    Source("es", "VoxPopuli", "facebook/voxpopuli", "es", "train", "normalized_text",
           speaker_key="speaker_id"),
    Source("es", "FLEURS",    "google/fleurs", "es_419", "train", "transcription",
           revision=FLEURS_PARQUET, weight=0.5),
    Source("hi", "FLEURS",    "google/fleurs", "hi_in", "train", "transcription", revision=FLEURS_PARQUET),
]

# Base checkpoints, tried in order per language.
BASE_CHECKPOINTS = {
    "en": ["facebook/mms-tts-eng"],
    "ur": ["facebook/mms-tts-urd-script_arabic"],
    "ar": ["facebook/mms-tts-ara"],
    "de": ["facebook/mms-tts-deu"],
    "fr": ["facebook/mms-tts-fra"],
    "es": ["facebook/mms-tts-spa"],
    "hi": ["facebook/mms-tts-hin"],
}

SOURCES = [s for s in REGISTRY if s.lang in ACTIVE_LANGS and (HF_TOKEN or not s.gated)]


# ------------------------------------------------ 6. MATERIALISE THE CORPUS
from datasets import (
    Audio, Dataset, Features, Sequence, Value,
    concatenate_datasets, load_dataset, load_from_disk,
)

MIN_S, MAX_S = CLIP_SECONDS

CORPUS_FEATURES = Features({
    "audio":    Sequence(Value("int16")),
    "text":     Value("string"),
    "language": Value("string"),
    "source":   Value("string"),
    # Stored, not derived: reading it back scans one float column, whereas
    # len() over the audio column pulls every waveform into RAM to count samples.
    "seconds":  Value("float32"),
    "sr":       Value("int32"),
})

_TEXT_CANDIDATES = ["text", "sentence", "transcription", "transcript", "normalized_text"]

# Standard Buckwalter -> Arabic script (plus "^" for thaa, which the Arabic
# Speech Corpus uses alongside "v").
_BUCKWALTER = {
    "'": "ء", "|": "آ", ">": "أ", "&": "ؤ", "<": "إ", "}": "ئ",
    "A": "ا", "b": "ب", "p": "ة", "t": "ت", "v": "ث", "^": "ث",
    "j": "ج", "H": "ح", "x": "خ", "d": "د", "*": "ذ", "r": "ر",
    "z": "ز", "s": "س", "$": "ش", "S": "ص", "D": "ض", "T": "ط",
    "Z": "ظ", "E": "ع", "g": "غ", "_": "ـ", "f": "ف", "q": "ق",
    "k": "ك", "l": "ل", "m": "م", "n": "ن", "h": "ه", "w": "و",
    "Y": "ى", "y": "ي", "F": "ً", "N": "ٌ", "K": "ٍ", "a": "َ",
    "u": "ُ", "i": "ِ", "~": "ّ", "o": "ْ", "`": "ٰ", "{": "ٱ",
}
# Harakat/shadda/sukun/dagger alif. The mms-tts-ara vocabulary has no
# diacritics at all (the tokenizer would drop them), and users type
# undiacritized Arabic and Urdu anyway — strip them so the transcripts match
# exactly what the tokenizer sees at inference time.
_ARABIC_DIACRITICS = dict.fromkeys(list(range(0x064B, 0x0653)) + [0x0670])


def buckwalter_to_arabic(text: str) -> str:
    return "".join(_BUCKWALTER.get(ch, ch) for ch in text)


def decode_audio(value, target_sr):
    """{"bytes"|"path"} (an Audio(decode=False) cell) -> mono float32 at target_sr.
    Done here with soundfile + librosa instead of datasets' own decoder, which
    in datasets 4 means torchcodec — a package that has to match the exact torch
    build and would otherwise pull a CPU torch over Colab's CUDA one."""
    import io
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


def stream_source(path, config, split, text_key, audio_key, speaker_key,
                  budget_seconds, deadline_seconds, language, source_name, target_sr,
                  revision=None, transliteration=None):
    """Yield clean {audio,int16 / text / ...} rows until the hour budget or the
    wall-clock deadline is hit.

    Module-level (not a closure) so Dataset.from_generator can fingerprint it
    and reuse the cached Arrow shard instead of re-streaming.

    speaker_key is what makes multi-speaker corpora usable for TTS at all: it
    locks onto the FIRST speaker seen and keeps only their clips. Training VITS
    on 500 mixed speakers produces the average of 500 voices, which is why the
    result can end up muddier than the base checkpoint it started from.
    """
    kwargs = dict(split=split, streaming=True, revision=revision)
    ds = load_dataset(path, config, **kwargs) if config else load_dataset(path, **kwargs)
    ds = ds.cast_column(audio_key, Audio(decode=False))

    first = next(iter(ds.take(1)))
    if text_key == "AUTO":
        text_key = next((c for c in _TEXT_CANDIDATES if c in first), None)
        if text_key is None:
            raise ValueError(f"no recognisable transcript column in {list(first.keys())}")
    if speaker_key and speaker_key not in first:
        speaker_key = None

    started = time.time()
    kept_seconds = 0.0
    pinned_speaker = None
    seen = set()
    scanned = 0

    for row in ds:
        scanned += 1
        if kept_seconds >= budget_seconds or (time.time() - started) > deadline_seconds:
            break

        if speaker_key:
            speaker = row.get(speaker_key)
            if pinned_speaker is None:
                pinned_speaker = speaker
            elif speaker != pinned_speaker:
                # Give up on the pin if this speaker is too rare to fill the
                # budget — a corpus where every row is a different speaker would
                # otherwise stream forever and yield almost nothing.
                if scanned > 20000 and kept_seconds < budget_seconds * 0.1:
                    logger.warning(f"  ! {source_name}: speaker pin too sparse, accepting all speakers")
                    speaker_key = None
                continue

        text = row.get(text_key)
        if transliteration == "buckwalter" and text:
            text = buckwalter_to_arabic(str(text))
        text = normalise_text(text)
        if language in ("ar", "ur"):
            text = text.translate(_ARABIC_DIACRITICS)
        if len(text) < 2 or len(text) > 400:
            continue
        h = hash(text)
        if h in seen:
            continue

        try:
            array = decode_audio(row[audio_key], target_sr)
        except Exception as e:
            logger.warning(f"  ! {source_name}: undecodable clip skipped ({type(e).__name__}: {e})")
            continue
        duration = len(array) / target_sr
        if not (MIN_S <= duration <= MAX_S):
            continue
        # Monotonic alignment needs at least one spectrogram frame per token,
        # and MMS tokenizers interleave a blank between every character (~2x
        # tokens, a bit more after romanization). Normal speech is 10-16
        # chars/s against ~62 frames/s; a transcript far denser than that is
        # a mis-segmented clip and would only teach the aligner garbage.
        if len(text) > duration * MAX_CHARS_PER_SECOND:
            continue

        # Peak-normalise. VITS reconstructs a waveform directly, so a corpus
        # with inconsistent recording levels teaches it to model the level
        # variation rather than the voice.
        peak = float(np.max(np.abs(array))) if array.size else 0.0
        if peak < 1e-4:
            continue
        array = array / peak * 0.95

        seen.add(h)
        kept_seconds += duration
        yield {
            "audio": (array * 32767).astype(np.int16),
            "text": text,
            "language": language,
            "source": source_name,
            "seconds": duration,
            "sr": target_sr,
        }


def build_source(src: Source, budget_seconds: float, target_sr: int):
    """Materialise one source to an Arrow shard on Drive, or reuse the cached one.
    The cache key carries the budget and sample rate, so changing either rebuilds
    only what genuinely has to change."""
    shard = CORPUS_CACHE / f"{src.lang}__{src.name}__{target_sr}__{int(budget_seconds)}s"
    if shard.exists():
        try:
            cached = load_from_disk(str(shard))
            logger.info(f"  = {src.lang}/{src.name}: {len(cached)} cached clips")
            return cached
        except Exception as e:
            logger.warning(f"  ! cached shard {shard.name} unreadable ({e}) — rebuilding")
            shutil.rmtree(shard, ignore_errors=True)

    ds = Dataset.from_generator(
        stream_source,
        features=CORPUS_FEATURES,
        cache_dir=str(HF_CACHE),
        gen_kwargs=dict(
            path=src.path, config=src.config, split=src.split,
            text_key=src.text_key, audio_key=src.audio_key, speaker_key=src.speaker_key,
            budget_seconds=budget_seconds, deadline_seconds=MAX_MINUTES_PER_SOURCE * 60,
            language=src.lang, source_name=src.name, target_sr=target_sr,
            revision=src.revision, transliteration=src.transliteration,
        ),
    )
    if len(ds) == 0:
        raise RuntimeError("source yielded no usable clips")
    ds.save_to_disk(str(shard))
    return ds


# ------------------------------------------- 7. VITS TRAINING INTERNALS
# Everything the generator needs that transformers does not expose. The
# architecture itself is NOT reimplemented — VitsModel supplies text_encoder,
# posterior_encoder, flow, duration_predictor and decoder, and the code below
# only wires them into the training-time forward pass, which VitsModel.forward
# (inference-only) does not provide.

try:
    from numba import njit
except ImportError:  # numba ships with Colab; this is the belt-and-braces path
    logger.warning("numba missing — monotonic alignment falls back to pure Python and will be "
                   "roughly 100x slower. `pip install numba` if training crawls.")

    def njit(**_kwargs):
        def wrap(fn):
            return fn
        return wrap


# No cache=True: numba can only cache to disk when it can locate the defining
# source file, which it cannot for code pasted into a notebook cell — it would
# just warn on first call. Compilation happens once per session anyway.
@njit(nogil=True)
def _mas_kernel(paths, values, t_ys, t_xs):
    """Monotonic Alignment Search — the Viterbi pass that gives VITS its
    text-to-frame alignment without an external aligner.

    This is the exact dynamic program the reference implementation compiles with
    Cython; numba gets the same speed with no build step, which is what lets
    this file drop the monotonic_align extension entirely.
    """
    max_neg_val = -1e9
    for i in range(paths.shape[0]):
        path = paths[i]
        value = values[i]
        t_y = t_ys[i]
        t_x = t_xs[i]

        for y in range(t_y):
            for x in range(max(0, t_x + y - t_y), min(t_x, y + 1)):
                v_cur = max_neg_val if x == y else value[y - 1, x]
                if x == 0:
                    v_prev = 0.0 if y == 0 else max_neg_val
                else:
                    v_prev = value[y - 1, x - 1]
                value[y, x] += max(v_prev, v_cur)

        index = t_x - 1
        for y in range(t_y - 1, -1, -1):
            path[y, index] = 1
            if index != 0 and (index == y or value[y - 1, index] < value[y - 1, index - 1]):
                index -= 1


def maximum_path(neg_cent, mask):
    """neg_cent/mask: [b, t_y, t_x] -> hard monotonic alignment [b, t_y, t_x]."""
    device, dtype = neg_cent.device, neg_cent.dtype
    value = (neg_cent * mask).detach().cpu().numpy().astype(np.float32)
    path = np.zeros_like(value, dtype=np.int32)
    t_y = mask.sum(1)[:, 0].detach().cpu().numpy().astype(np.int32)
    t_x = mask.sum(2)[:, 0].detach().cpu().numpy().astype(np.int32)
    _mas_kernel(path, value, t_y, t_x)
    return torch.from_numpy(path).to(device=device, dtype=dtype)


# torch 2.4 moved the AMP entry points off torch.cuda.amp; both spellings exist
# across the torch builds Colab has shipped this year, so pick whichever is
# actually present rather than eating a FutureWarning on every single step.
_AMP_NEW = hasattr(torch.amp, "GradScaler")


def make_grad_scaler():
    return torch.amp.GradScaler("cuda") if _AMP_NEW else torch.cuda.amp.GradScaler()


def autocast_fp16():
    return (torch.amp.autocast("cuda", dtype=torch.float16) if _AMP_NEW
            else torch.cuda.amp.autocast(dtype=torch.float16))


def disable_autocast():
    """Run a block in full fp32 even inside an autocast region."""
    return (torch.amp.autocast("cuda", enabled=False) if _AMP_NEW
            else torch.cuda.amp.autocast(enabled=False))


def sequence_mask(lengths, max_length=None):
    if max_length is None:
        max_length = int(lengths.max())
    positions = torch.arange(max_length, dtype=lengths.dtype, device=lengths.device)
    return (positions.unsqueeze(0) < lengths.unsqueeze(1)).float()


_stft_windows: Dict[str, torch.Tensor] = {}
_mel_bases: Dict[str, torch.Tensor] = {}


def linear_spectrogram(wav, n_fft, hop, win, center=False):
    """[b, n_samples] -> magnitude spectrogram [b, n_fft//2+1, frames]."""
    key = f"{win}_{wav.device}_{wav.dtype}"
    if key not in _stft_windows:
        _stft_windows[key] = torch.hann_window(win).to(device=wav.device, dtype=wav.dtype)
    pad = int((n_fft - hop) / 2)
    wav = F.pad(wav.unsqueeze(1), (pad, pad), mode="reflect").squeeze(1)
    spec = torch.stft(wav, n_fft, hop_length=hop, win_length=win, window=_stft_windows[key],
                      center=center, pad_mode="reflect", normalized=False, onesided=True,
                      return_complex=True)
    return torch.sqrt(spec.real.pow(2) + spec.imag.pow(2) + 1e-9)


def _hz_to_mel(hz):
    """Slaney mel scale — linear below 1 kHz, log above. Matches
    librosa.filters.mel(htk=False), which is what VITS was trained against."""
    hz = np.asarray(hz, dtype=np.float64)
    f_sp = 200.0 / 3
    min_log_hz, min_log_mel = 1000.0, 1000.0 / (200.0 / 3)
    logstep = np.log(6.4) / 27.0
    mel = hz / f_sp
    high = hz >= min_log_hz
    mel[high] = min_log_mel + np.log(hz[high] / min_log_hz) / logstep
    return mel


def _mel_to_hz(mel):
    mel = np.asarray(mel, dtype=np.float64)
    f_sp = 200.0 / 3
    min_log_hz, min_log_mel = 1000.0, 1000.0 / (200.0 / 3)
    logstep = np.log(6.4) / 27.0
    hz = f_sp * mel
    high = mel >= min_log_mel
    hz[high] = min_log_hz * np.exp(logstep * (mel[high] - min_log_mel))
    return hz


def mel_filterbank(sr, n_fft, n_mels, fmin=0.0, fmax=None):
    """Slaney-normalised triangular mel filterbank, [n_mels, n_fft//2+1].

    Inlined rather than imported from librosa: this is the only thing the
    training loop wanted librosa for, and a ~20-line filterbank is a much
    smaller thing to depend on than librosa's numba/soxr stack — which also
    happens to be one of the slower imports in the environment.
    """
    fmax = fmax or sr / 2.0
    fft_freqs = np.linspace(0, sr / 2.0, int(1 + n_fft // 2))
    mel_points = np.linspace(_hz_to_mel(np.array([fmin]))[0],
                             _hz_to_mel(np.array([fmax]))[0], n_mels + 2)
    mel_f = _mel_to_hz(mel_points)

    fdiff = np.diff(mel_f)
    ramps = mel_f[:, None] - fft_freqs[None, :]
    lower = -ramps[:-2] / fdiff[:-1, None]
    upper = ramps[2:] / fdiff[1:, None]
    weights = np.maximum(0.0, np.minimum(lower, upper))

    # Slaney normalisation: equal AREA per filter, so wide high-frequency
    # filters do not dominate the mel loss purely for being wide.
    enorm = 2.0 / (mel_f[2: n_mels + 2] - mel_f[:n_mels])
    return (weights * enorm[:, None]).astype(np.float32)


def spec_to_mel(spec, n_fft, num_mels, sr, fmin=0.0, fmax=None):
    key = f"{n_fft}_{num_mels}_{sr}_{fmin}_{fmax}_{spec.device}_{spec.dtype}"
    if key not in _mel_bases:
        basis = mel_filterbank(sr, n_fft, num_mels, fmin, fmax)
        _mel_bases[key] = torch.from_numpy(basis).to(device=spec.device, dtype=spec.dtype)
    mel = torch.matmul(_mel_bases[key], spec)
    return torch.log(torch.clamp(mel, min=1e-5))


def rand_slice_segments(x, x_lengths, segment_size):
    """Random fixed-length slice per item; VITS decodes only a short segment so
    the HiFi-GAN decoder and discriminator fit in memory at all."""
    b, _, t = x.size()
    max_start = torch.clamp(x_lengths - segment_size, min=0)
    ids = (torch.rand(b, device=x.device) * (max_start + 1)).long()
    out = torch.stack([x[i, :, ids[i]: ids[i] + segment_size] for i in range(b)])
    return out, ids


def slice_segments(x, ids, segment_size):
    return torch.stack([x[i, ..., ids[i]: ids[i] + segment_size] for i in range(x.size(0))])


# ---- HiFi-GAN discriminator (multi-period + multi-scale), as used by VITS ----
def _pad(k, d=1):
    return int((k * d - d) / 2)


# transformers' own VitsHifiGan picks the same way: the parametrizations form is
# the supported one on current torch, and the old spelling emits a FutureWarning
# for every layer it touches.
weight_norm = getattr(nn.utils.parametrizations, "weight_norm", None) or nn.utils.weight_norm


class DiscriminatorP(nn.Module):
    """Reshapes the waveform to 2-D with the given period and convolves, so each
    period picks up a different pitch-harmonic structure."""

    def __init__(self, period, kernel_size=5, stride=3):
        super().__init__()
        self.period = period
        norm = weight_norm
        self.convs = nn.ModuleList([
            norm(nn.Conv2d(1, 32, (kernel_size, 1), (stride, 1), (_pad(kernel_size), 0))),
            norm(nn.Conv2d(32, 128, (kernel_size, 1), (stride, 1), (_pad(kernel_size), 0))),
            norm(nn.Conv2d(128, 512, (kernel_size, 1), (stride, 1), (_pad(kernel_size), 0))),
            norm(nn.Conv2d(512, 1024, (kernel_size, 1), (stride, 1), (_pad(kernel_size), 0))),
            norm(nn.Conv2d(1024, 1024, (kernel_size, 1), 1, (_pad(kernel_size), 0))),
        ])
        self.conv_post = norm(nn.Conv2d(1024, 1, (3, 1), 1, (1, 0)))

    def forward(self, x):
        fmap = []
        b, c, t = x.shape
        if t % self.period:
            x = F.pad(x, (0, self.period - (t % self.period)), "reflect")
            t = x.shape[2]
        x = x.view(b, c, t // self.period, self.period)
        for layer in self.convs:
            x = F.leaky_relu(layer(x), 0.1)
            fmap.append(x)
        x = self.conv_post(x)
        fmap.append(x)
        return torch.flatten(x, 1, -1), fmap


class DiscriminatorS(nn.Module):
    def __init__(self):
        super().__init__()
        norm = weight_norm
        self.convs = nn.ModuleList([
            norm(nn.Conv1d(1, 16, 15, 1, padding=7)),
            norm(nn.Conv1d(16, 64, 41, 4, groups=4, padding=20)),
            norm(nn.Conv1d(64, 256, 41, 4, groups=16, padding=20)),
            norm(nn.Conv1d(256, 1024, 41, 4, groups=64, padding=20)),
            norm(nn.Conv1d(1024, 1024, 41, 4, groups=256, padding=20)),
            norm(nn.Conv1d(1024, 1024, 5, 1, padding=2)),
        ])
        self.conv_post = norm(nn.Conv1d(1024, 1, 3, 1, padding=1))

    def forward(self, x):
        fmap = []
        for layer in self.convs:
            x = F.leaky_relu(layer(x), 0.1)
            fmap.append(x)
        x = self.conv_post(x)
        fmap.append(x)
        return torch.flatten(x, 1, -1), fmap


class MultiPeriodDiscriminator(nn.Module):
    def __init__(self, periods=(2, 3, 5, 7, 11)):
        super().__init__()
        self.discriminators = nn.ModuleList([DiscriminatorS()] + [DiscriminatorP(p) for p in periods])

    def forward(self, y, y_hat):
        y_d_rs, y_d_gs, fmap_rs, fmap_gs = [], [], [], []
        for d in self.discriminators:
            y_d_r, fmap_r = d(y)
            y_d_g, fmap_g = d(y_hat)
            y_d_rs.append(y_d_r)
            y_d_gs.append(y_d_g)
            fmap_rs.append(fmap_r)
            fmap_gs.append(fmap_g)
        return y_d_rs, y_d_gs, fmap_rs, fmap_gs


def feature_loss(fmap_r, fmap_g):
    loss = 0.0
    for dr, dg in zip(fmap_r, fmap_g):
        for rl, gl in zip(dr, dg):
            loss = loss + torch.mean(torch.abs(rl.detach() - gl))
    return loss * 2


def discriminator_loss(real_outputs, generated_outputs):
    loss = 0.0
    for dr, dg in zip(real_outputs, generated_outputs):
        loss = loss + torch.mean((1 - dr.float()) ** 2) + torch.mean(dg.float() ** 2)
    return loss


def generator_loss(generated_outputs):
    loss = 0.0
    for dg in generated_outputs:
        loss = loss + torch.mean((1 - dg.float()) ** 2)
    return loss


def kl_divergence_loss(z_p, logs_q, m_p, logs_p, z_mask):
    kl = logs_p - logs_q - 0.5 + 0.5 * ((z_p - m_p) ** 2) * torch.exp(-2.0 * logs_p)
    return torch.sum(kl * z_mask) / torch.sum(z_mask)


# ------------------------------------------------ 8. THE TRAINING FORWARD PASS
class VitsTrainingStep:
    """The training-time forward pass around a transformers VitsModel.

    VitsModel.forward() is inference-only (text -> waveform, durations sampled
    from the predictor). Training needs the other path: encode the TARGET audio
    with the posterior encoder, align it to the text with MAS, and supervise the
    duration predictor with that alignment. All the submodules for it already
    exist on VitsModel — only the wiring is missing, and that is what this is.
    """

    def __init__(self, model, config):
        self.model = model
        self.config = config
        self.hop = int(np.prod(config.upsample_rates))
        self.n_fft = (config.spectrogram_bins - 1) * 2
        self.win = self.n_fft
        self.sr = config.sampling_rate
        self.num_mels = 80
        self.stochastic = getattr(config, "use_stochastic_duration_prediction", True)

        if getattr(config, "num_speakers", 1) > 1:
            raise NotImplementedError(
                "This trainer targets the single-speaker MMS/LJS checkpoints, which is what "
                "one-voice-per-language needs. A multi-speaker base would need speaker "
                "embeddings threaded through every submodule call below."
            )

    def spectrograms(self, waveform):
        spec = linear_spectrogram(waveform, self.n_fft, self.hop, self.win)
        mel = spec_to_mel(spec, self.n_fft, self.num_mels, self.sr)
        return spec, mel

    def __call__(self, input_ids, attention_mask, waveform, wav_lengths):
        model = self.model

        spec, mel = self.spectrograms(waveform)
        spec_lengths = torch.clamp(wav_lengths // self.hop, max=spec.size(-1))

        x_mask = attention_mask.unsqueeze(1).to(spec.dtype)                    # [b,1,t_x]
        y_mask = sequence_mask(spec_lengths, spec.size(-1)).unsqueeze(1)       # [b,1,t_y]

        text_out = model.text_encoder(input_ids=input_ids, padding_mask=x_mask.transpose(1, 2),
                                      attention_mask=attention_mask, return_dict=True)
        hidden = text_out.last_hidden_state.transpose(1, 2)                    # [b,h,t_x]
        m_p = text_out.prior_means.transpose(1, 2)                             # [b,d,t_x]
        logs_p = text_out.prior_log_variances.transpose(1, 2)

        z, m_q, logs_q = model.posterior_encoder(spec, y_mask)
        z_p = model.flow(z, y_mask)

        # --- monotonic alignment search (no gradient; it is a hard assignment)
        # Forced to fp32. logs_p is a LOG-VARIANCE, so exp(-2 * logs_p) reaches
        # the thousands for a confidently-narrow prior, which overflows fp16 to
        # inf and silently turns every alignment into garbage under autocast.
        with torch.no_grad(), disable_autocast():
            m_p32, logs_p32, z_p32 = m_p.float(), logs_p.float(), z_p.float()
            s_p_sq_r = torch.exp(-2 * logs_p32)
            neg1 = torch.sum(-0.5 * math.log(2 * math.pi) - logs_p32, [1], keepdim=True)
            neg2 = torch.matmul(-0.5 * (z_p32 ** 2).transpose(1, 2), s_p_sq_r)
            neg3 = torch.matmul(z_p32.transpose(1, 2), m_p32 * s_p_sq_r)
            neg4 = torch.sum(-0.5 * (m_p32 ** 2) * s_p_sq_r, [1], keepdim=True)
            neg_cent = neg1 + neg2 + neg3 + neg4                               # [b,t_y,t_x]
            attn_mask = x_mask.unsqueeze(2) * y_mask.unsqueeze(-1)             # [b,1,t_y,t_x]
            attn = maximum_path(neg_cent, attn_mask.squeeze(1).float())        # [b,t_y,t_x]

        durations = attn.sum(1).unsqueeze(1)                                   # [b,1,t_x] frames per token

        # --- duration loss, also fp32: the stochastic predictor's flows run
        # log/sigmoid/clamp chains that lose the small differences they depend
        # on at half precision.
        with disable_autocast():
            hidden32, x_mask32 = hidden.float(), x_mask.float()
            if self.stochastic:
                nll = model.duration_predictor(hidden32, x_mask32, None, durations)
                loss_dur = torch.sum(nll) / torch.sum(x_mask32)
            else:
                log_dur_target = torch.log(durations + 1e-6) * x_mask32
                log_dur_pred = model.duration_predictor(hidden32, x_mask32)
                loss_dur = torch.sum((log_dur_pred - log_dur_target) ** 2) / torch.sum(x_mask32)

        # --- expand the text-side prior along the alignment
        attn_g = attn.to(m_p.dtype)   # back to the autocast dtype for the matmuls
        m_p_exp = torch.matmul(attn_g, m_p.transpose(1, 2)).transpose(1, 2)    # [b,d,t_y]
        logs_p_exp = torch.matmul(attn_g, logs_p.transpose(1, 2)).transpose(1, 2)

        # --- decode one random segment (a full utterance would not fit)
        z_slice, ids = rand_slice_segments(z, spec_lengths, SEGMENT_FRAMES)
        y_hat = model.decoder(z_slice)                                         # [b,1,seg*hop]
        y_real = slice_segments(waveform.unsqueeze(1), ids * self.hop, SEGMENT_FRAMES * self.hop)
        mel_real = slice_segments(mel, ids, SEGMENT_FRAMES)

        return dict(
            y_hat=y_hat, y_real=y_real, mel_real=mel_real,
            z_p=z_p, logs_q=logs_q, m_p_exp=m_p_exp, logs_p_exp=logs_p_exp,
            y_mask=y_mask, loss_dur=loss_dur,
        )


@dataclass
class VitsCollator:
    """Pads text ids and waveforms. Spectrograms are deliberately NOT computed
    here — torch.stft on the GPU inside the training step is faster than
    computing them on CPU workers and shipping the (much larger) result across."""
    tokenizer: Any
    # Romanized text, precomputed once per corpus for any is_uroman voice.
    # uroman is slow enough that romanizing inside the collator would redo the
    # same few thousand strings on every epoch, in every worker.
    roman: Optional[Dict[str, str]] = None

    def __call__(self, rows: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        if self.roman is None:
            texts = [r["text"] for r in rows]
        else:
            texts = [self.roman.get(r["text"]) or uromanize(r["text"]) for r in rows]
        encoded = self.tokenizer(texts, padding=True, truncation=True,
                                 max_length=MAX_TEXT_TOKENS, return_tensors="pt")

        waves = [np.asarray(r["audio"], dtype=np.float32) / 32768.0 for r in rows]
        lengths = torch.tensor([len(w) for w in waves], dtype=torch.long)
        max_len = int(lengths.max())
        batch_wave = torch.zeros(len(waves), max_len, dtype=torch.float32)
        for i, w in enumerate(waves):
            batch_wave[i, : len(w)] = torch.from_numpy(w)

        return {
            "input_ids": encoded["input_ids"],
            "attention_mask": encoded["attention_mask"],
            "waveform": batch_wave,
            "wav_lengths": lengths,
        }


def newest_checkpoint(*lang_dirs: Path):
    """Highest-step checkpoint across the given dirs (local scratch + Drive)."""
    ckpts = [p for d in lang_dirs for p in Path(d).glob("step_*.pt")]
    return max(ckpts, key=lambda p: int(p.stem.split("_")[-1])) if ckpts else None


def persist_checkpoint(lang: str):
    """Copy a language's newest local checkpoint to Drive, replacing the old one.

    Called once per language when it stops training (finished, interrupted or
    failed), so Drive holds one checkpoint per language and Trash gets at most
    one superseded file per language per session.
    """
    if LOCAL_CKPT_ROOT == TTS_CKPT_ROOT:
        return
    src = newest_checkpoint(LOCAL_CKPT_ROOT / lang)
    if src is None:
        return
    dst_dir = TTS_CKPT_ROOT / lang
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / src.name
    try:
        if not (dst.exists() and dst.stat().st_size == src.stat().st_size):
            shutil.copy2(src, dst)
        if dst.stat().st_size != src.stat().st_size:
            raise OSError(f"size mismatch after copy ({dst.stat().st_size} != {src.stat().st_size})")
        for old in dst_dir.glob("step_*.pt"):
            if old != dst:
                old.unlink(missing_ok=True)
        logger.info(f"[{lang}] checkpoint persisted -> {dst}")
    except OSError as e:
        logger.error(f"[{lang}] could NOT persist checkpoint to Drive ({e}). Drive is probably "
                     f"full — it is still at {src}; download it before the runtime ends.")


def train_language(lang: str, corpus, base_dirs: List[str]):
    """Fine-tune one language's VITS voice. Returns the exported directory."""
    from torch.utils.tensorboard import SummaryWriter
    from transformers import AutoTokenizer, VitsModel

    lang_dir = LOCAL_CKPT_ROOT / lang
    lang_dir.mkdir(parents=True, exist_ok=True)

    model = tokenizer = base_used = None
    for base in base_dirs:
        try:
            model, info = VitsModel.from_pretrained(base, output_loading_info=True)
            tokenizer = AutoTokenizer.from_pretrained(base)
            base_used = base
            break
        except Exception as e:
            logger.warning(f"[{lang}] base {base} unavailable ({type(e).__name__}: {e})")
    if model is None:
        raise RuntimeError(f"no usable base checkpoint for '{lang}' among {base_dirs}")
    # The MMS checkpoints store weight norm as weight_g/weight_v. Older
    # transformers (e.g. 4.44) cannot map those onto torch's parametrized
    # weight-norm names and RANDOMLY initialises every WaveNet layer in the flow
    # and posterior encoder — fine-tuning on top of that gives a broken voice
    # with no error. Refuse to train rather than produce improper weights.
    if info["missing_keys"]:
        raise RuntimeError(
            f"{len(info['missing_keys'])} weights of {base_used} were not loaded (e.g. "
            f"{info['missing_keys'][0]}). Upgrade transformers (`pip install -U 'transformers<5'`) "
            f"and restart the runtime."
        )

    cfg = model.config
    is_uroman = bool(getattr(tokenizer, "is_uroman", False)) or tokenizer_is_uroman(base_used)
    logger.info(f"[{lang}] base={base_used} sr={cfg.sampling_rate} uroman={is_uroman}")

    roman = None
    if is_uroman:
        # Romanize the whole corpus up front. Doing it here rather than in the
        # collator both fails loudly right now if no romanizer is installed —
        # instead of 900 steps in — and keeps uroman off the per-batch path.
        started_roman = time.time()
        lcode = UROMAN_LCODE.get(lang)
        roman = {t: uromanize(t, lcode) for t in set(corpus["text"])}
        logger.info(f"[{lang}] romanized {len(roman)} unique transcripts in {hhmm(time.time() - started_roman)}")

    frozen = [model.text_encoder, model.duration_predictor] if FREEZE_TEXT_SIDE else []
    for module in frozen:
        module.requires_grad_(False)

    def train_mode():
        # Frozen modules stay in eval mode too: their dropout and layerdrop
        # would otherwise keep perturbing the priors and durations the
        # trainable side is learning to match.
        model.train()
        for module in frozen:
            module.eval()

    device = torch.device("cuda")
    model = model.to(device)
    train_mode()
    discriminator = MultiPeriodDiscriminator().to(device).train()
    trainable = [p for p in model.parameters() if p.requires_grad]
    logger.info(f"[{lang}] training {sum(p.numel() for p in trainable) / 1e6:.1f}M of "
                f"{sum(p.numel() for p in model.parameters()) / 1e6:.1f}M generator params "
                f"(frozen: {[type(m).__name__ for m in frozen] or 'none'})")

    step_fn = VitsTrainingStep(model, cfg)
    optim_g = torch.optim.AdamW(trainable, lr=LEARNING_RATE, betas=(0.8, 0.99), eps=1e-9)
    optim_d = torch.optim.AdamW(discriminator.parameters(), lr=LEARNING_RATE, betas=(0.8, 0.99), eps=1e-9)
    scaler = make_grad_scaler()

    start_step = 0
    resume = newest_checkpoint(lang_dir, TTS_CKPT_ROOT / lang)
    if resume is not None:
        # weights_only=False: these are our own checkpoints and they carry
        # optimizer/scaler state, not just tensors. torch>=2.6 defaults to True
        # and would reject them.
        state = torch.load(resume, map_location=device, weights_only=False)
        model.load_state_dict(state["model"])
        discriminator.load_state_dict(state["discriminator"])
        optim_g.load_state_dict(state["optim_g"])
        optim_d.load_state_dict(state["optim_d"])
        scaler.load_state_dict(state["scaler"])
        start_step = state["step"]
        logger.info(f"[{lang}] resumed from {resume.name}")

    if start_step >= STEPS_PER_LANGUAGE:
        logger.info(f"[{lang}] already at {start_step}/{STEPS_PER_LANGUAGE} steps — nothing to do")
        del model, discriminator, optim_g, optim_d
        free_memory()
        return base_used

    # drop_last=True means a corpus smaller than one batch yields NO batches at
    # all, which would make the step loop below spin forever without training.
    batch_size = min(BATCH_SIZE, len(corpus))
    if batch_size < 1:
        raise RuntimeError(f"corpus for '{lang}' is empty")
    if batch_size < BATCH_SIZE:
        logger.warning(f"[{lang}] only {len(corpus)} clips — batch size dropped to {batch_size}")

    loader = DataLoader(
        corpus, batch_size=batch_size, shuffle=True, drop_last=True,
        num_workers=2, pin_memory=True, persistent_workers=True,
        collate_fn=VitsCollator(tokenizer=tokenizer, roman=roman),
    )
    writer = SummaryWriter(str(lang_dir / "tb"))

    step = start_step
    started = time.time()
    print(f"\n{'=' * 72}\n[{lang}] training steps {start_step} -> {STEPS_PER_LANGUAGE}\n{'=' * 72}")

    while step < STEPS_PER_LANGUAGE:
        for batch in loader:
            if step >= STEPS_PER_LANGUAGE:
                break
            batch = {k: v.to(device, non_blocking=True) for k, v in batch.items()}

            with autocast_fp16():
                out = step_fn(**batch)
                y_hat, y_real = out["y_hat"], out["y_real"]

            # ---------------- discriminator
            with autocast_fp16():
                d_real, d_fake, _, _ = discriminator(y_real, y_hat.detach())
                loss_d = discriminator_loss(d_real, d_fake)
            optim_d.zero_grad(set_to_none=True)
            scaler.scale(loss_d).backward()
            scaler.unscale_(optim_d)
            torch.nn.utils.clip_grad_norm_(discriminator.parameters(), 100.0)
            scaler.step(optim_d)

            # ---------------- generator
            # The adversarial and feature-matching terms ramp in over
            # ADV_WARMUP_STEPS. Our discriminator starts from random init (the
            # pretrained MMS one is not published outside the conversion script
            # this file deliberately no longer depends on), and a random critic
            # early on emits confident nonsense — ramping lets it become
            # informative before it is allowed to steer the generator, while mel
            # and KL carry training from step 1.
            adv_weight = min(1.0, (step + 1) / max(ADV_WARMUP_STEPS, 1))

            with autocast_fp16():
                _, d_fake_g, fmap_r, fmap_g = discriminator(y_real, y_hat)
                mel_hat = spec_to_mel(
                    linear_spectrogram(y_hat.squeeze(1).float(), step_fn.n_fft, step_fn.hop, step_fn.win),
                    step_fn.n_fft, step_fn.num_mels, step_fn.sr,
                )
                loss_mel = F.l1_loss(out["mel_real"].float(), mel_hat) * C_MEL
                loss_kl = kl_divergence_loss(out["z_p"].float(), out["logs_q"].float(),
                                             out["m_p_exp"].float(), out["logs_p_exp"].float(),
                                             out["y_mask"].float()) * C_KL
                loss_fm = feature_loss(fmap_r, fmap_g) * C_FM * adv_weight
                loss_adv = generator_loss(d_fake_g) * C_ADV * adv_weight
                loss_dur = out["loss_dur"] * C_DUR
                loss_g = loss_mel + loss_kl + loss_fm + loss_adv + loss_dur

            optim_g.zero_grad(set_to_none=True)
            scaler.scale(loss_g).backward()
            scaler.unscale_(optim_g)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 100.0)
            scaler.step(optim_g)
            scaler.update()

            step += 1

            if step % LOG_EVERY == 0:
                rate = (step - start_step) / max(time.time() - started, 1e-6)
                print(f"[{lang}] step {step}/{STEPS_PER_LANGUAGE}  "
                      f"mel {loss_mel.item():.2f}  kl {loss_kl.item():.2f}  "
                      f"dur {loss_dur.item():.2f}  fm {loss_fm.item():.2f}  "
                      f"adv {loss_adv.item():.2f}  d {loss_d.item():.2f}  "
                      f"({rate:.2f} it/s, eta {hhmm((STEPS_PER_LANGUAGE - step) / max(rate, 1e-6))})")
                for tag, val in (("mel", loss_mel), ("kl", loss_kl), ("dur", loss_dur),
                                 ("fm", loss_fm), ("adv", loss_adv), ("disc", loss_d)):
                    writer.add_scalar(f"loss/{tag}", val.item(), step)

            if step % EVAL_EVERY == 0:
                # Log actual audio, not just loss curves. VITS losses move very
                # little once training is under way — mel loss drifting from
                # 22.4 to 22.1 tells you nothing about whether the voice became
                # intelligible, and listening is the only real eval here.
                # TensorBoard > AUDIO renders these inline.
                model.eval()
                try:
                    preview_text = SAMPLE_TEXT.get(lang, "This is a test.")
                    if roman is not None:
                        preview_text = uromanize(preview_text, UROMAN_LCODE.get(lang))
                    with torch.no_grad():
                        ids = tokenizer(preview_text, return_tensors="pt").to(device)
                        wav = model(**ids).waveform[0].float().cpu()
                    writer.add_audio(f"preview/{lang}", wav.unsqueeze(0), step,
                                     sample_rate=cfg.sampling_rate)
                except Exception as e:
                    logger.warning(f"[{lang}] preview at step {step} failed: {e}")
                train_mode()

            if step % SAVE_EVERY == 0 or step == STEPS_PER_LANGUAGE:
                path = lang_dir / f"step_{step}.pt"
                torch.save({
                    "model": model.state_dict(), "discriminator": discriminator.state_dict(),
                    "optim_g": optim_g.state_dict(), "optim_d": optim_d.state_dict(),
                    "scaler": scaler.state_dict(), "step": step, "base": base_used,
                }, path)
                for old in sorted(lang_dir.glob("step_*.pt"),
                                  key=lambda p: int(p.stem.split("_")[-1]))[:-2]:
                    old.unlink(missing_ok=True)
                logger.info(f"[{lang}] checkpoint -> {path.name}")

    writer.close()
    # Deliberately return nothing but the base id. Holding seven trained VITS
    # models resident across the language loop costs ~1 GB for weights the
    # export stage re-reads from the checkpoint anyway — and re-reading is the
    # same code path it needs for a language trained in an EARLIER session, so
    # letting these go keeps one path instead of two.
    del model, discriminator, optim_g, optim_d, scaler, loader
    free_memory()
    return base_used


# ---------------------------------------- 9. BUILD CORPORA + TRAIN EACH VOICE
from transformers import AutoTokenizer, VitsConfig, VitsModel

targets = TRAIN_ONLY or ACTIVE_LANGS

for lang in (targets if RUN_TRAINING else []):
    bases = BASE_CHECKPOINTS.get(lang)
    if not bases:
        logger.warning(f"[{lang}] no base checkpoint configured — skipping")
        continue

    # The corpus must be resampled to the BASE checkpoint's rate (MMS is 16 kHz,
    # LJS is 22.05 kHz). Reading it off the config first means the cached shard
    # is built at the right rate once, instead of being resampled every epoch.
    try:
        target_sr = VitsConfig.from_pretrained(bases[0]).sampling_rate
    except Exception as e:
        logger.warning(f"[{lang}] could not read config from {bases[0]} ({e}) — assuming 16 kHz")
        target_sr = 16000

    lang_sources = [s for s in SOURCES if s.lang == lang]
    if not lang_sources:
        logger.warning(f"[{lang}] no datasets enabled — skipping")
        continue

    total_weight = sum(s.weight for s in lang_sources)
    budget_total = HOURS_PER_LANGUAGE * 3600
    print(f"\n--- {lang}: corpus, {hhmm(budget_total)} @ {target_sr} Hz ---")

    shards, unfilled = [], 0.0
    for i, src in enumerate(lang_sources):
        share = budget_total * src.weight / total_weight + unfilled / max(len(lang_sources) - i, 1)
        try:
            ds = build_source(src, share, target_sr)
            got = float(sum(ds["seconds"]))
            unfilled += max(share - got, 0.0)
            shards.append(ds)
            logger.info(f"  + {lang}/{src.name}: {len(ds)} clips, {hhmm(got)}")
        except Exception as e:
            unfilled += share
            logger.warning(f"  - SKIPPED {lang}/{src.name} — {type(e).__name__}: {e}")
        free_memory()

    if not shards:
        logger.warning(f"[{lang}] every dataset failed — skipping this language")
        continue

    corpus = concatenate_datasets(shards).shuffle(seed=42)
    # numpy format so the collator gets an int16 ndarray straight out of Arrow.
    # The default python format would hand it a list of ~100k boxed ints per
    # clip and spend more time building that list than on the STFT.
    corpus.set_format("numpy", columns=["audio"], output_all_columns=True)
    print(f"[{lang}] corpus: {len(corpus)} clips, {hhmm(float(sum(corpus['seconds'])))}")

    try:
        train_language(lang, corpus, bases)
    except KeyboardInterrupt:
        print(f"\n[{lang}] interrupted — its newest checkpoint is being copied to {TTS_CKPT_ROOT / lang}. "
              f"Interrupt again within 3 s to stop training the remaining languages.")
        try:
            time.sleep(3)
        except KeyboardInterrupt:
            print("Stopping the training stage; moving to preview/export.")
            break
    except Exception as e:
        logger.error(f"[{lang}] training failed — {type(e).__name__}: {e}")
    finally:
        persist_checkpoint(lang)
    del corpus
    free_memory()


# ------------------------------------------- 10. PREVIEW + EXPORT FINAL VOICES
if RUN_PREVIEW:
    try:
        from IPython.display import Audio as _Audio, display
        HAVE_IPY = True
    except ImportError:
        HAVE_IPY = False

    import soundfile as sf

    exported, failed = [], []
    for lang in ACTIVE_LANGS:
        bases = BASE_CHECKPOINTS.get(lang, [])

        # Always rebuild from the checkpoint on Drive rather than from whatever
        # is still in memory. One path covers a language trained in this
        # session, one trained in an earlier session, and RUN_TRAINING=False —
        # and it verifies that what actually landed on Drive is loadable, which
        # is the artifact the service will consume.
        ckpt = newest_checkpoint(LOCAL_CKPT_ROOT / lang, TTS_CKPT_ROOT / lang)
        if ckpt is None:
            logger.info(f"[{lang}] no checkpoint yet — nothing to export")
            continue
        state = torch.load(ckpt, map_location="cpu", weights_only=False)
        base_used = state.get("base") or (bases[0] if bases else None)
        try:
            model = VitsModel.from_pretrained(base_used)
            tokenizer = AutoTokenizer.from_pretrained(base_used)
            model.load_state_dict(state["model"])
        except Exception as e:
            logger.warning(f"[{lang}] could not rebuild from {ckpt.name}: {e}")
            continue
        logger.info(f"[{lang}] loaded {ckpt.name} (step {state.get('step')}) for export")

        model = model.to("cuda").eval()
        text = SAMPLE_TEXT.get(lang, "This is a test.")
        spoken = (uromanize(text, UROMAN_LCODE.get(lang))
                  if getattr(tokenizer, "is_uroman", False) else text)

        with torch.no_grad():
            inputs = tokenizer(spoken, return_tensors="pt").to("cuda")
            waveform = model(**inputs).waveform[0].float().cpu().numpy()

        print(f"\n[{lang}] {text}")
        if HAVE_IPY:
            display(_Audio(waveform, rate=model.config.sampling_rate))

        # Stage on local disk, prove the weights reload, THEN copy to Drive and
        # check every file arrived at full size. Writing straight to Drive is
        # how a previous run ended up with config + tokenizer + preview.wav but
        # no model.safetensors — and nothing said so.
        stage_dir = LOCAL_EXPORT_ROOT / lang
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        stage_dir.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(str(stage_dir))
        tokenizer.save_pretrained(str(stage_dir))
        sf.write(str(stage_dir / "preview.wav"), waveform, model.config.sampling_rate)
        del model, tokenizer
        free_memory()

        try:
            _, info = VitsModel.from_pretrained(str(stage_dir), output_loading_info=True)
            if not (stage_dir / "model.safetensors").exists() or info["missing_keys"]:
                raise RuntimeError(f"weights incomplete (missing keys: {len(info['missing_keys'])})")
        except Exception as e:
            logger.error(f"[{lang}] staged export does not reload — {e}")
            failed.append(lang)
            continue

        final_dir = TTS_FINAL_ROOT / lang
        try:
            if final_dir.exists():
                shutil.rmtree(final_dir)
            shutil.copytree(stage_dir, final_dir)
            short = [f.name for f in stage_dir.iterdir()
                     if not (final_dir / f.name).exists()
                     or (final_dir / f.name).stat().st_size != f.stat().st_size]
            if short:
                raise OSError(f"incomplete on Drive: {short}")
        except OSError as e:
            logger.error(f"[{lang}] Drive copy failed ({e}). The verified voice is at {stage_dir} — "
                         f"download it from the Colab file browser before the runtime ends.")
            failed.append(lang)
            continue
        size_mb = (final_dir / "model.safetensors").stat().st_size / 1e6
        print(f"[{lang}] exported -> {final_dir}  (model.safetensors {size_mb:.0f} MB)")
        exported.append(lang)

    print(f"\nExported : {exported or 'none'}")
    if failed:
        print(f"FAILED   : {failed}  (see errors above; local copies under {LOCAL_EXPORT_ROOT})")
    print(f"Voices under {TTS_FINAL_ROOT}")
    print("  -> copy each <lang>/ folder to stt-tts-service/models/tts_model_final/")
    print("     every folder MUST contain model.safetensors (~145 MB)")

    # The Drive mount uploads in the background. Flushing here blocks until the
    # large files are actually on Drive, instead of trusting a runtime that may
    # be recycled before the upload finishes.
    if IN_COLAB:
        print("\nFlushing Drive (waits for uploads to finish)...")
        drive.flush_and_unmount()
        print("Drive flushed. Re-running this cell remounts it.")


# ------------------------------------ 11. THE INFERENCE WRAPPER THE API USES
class MultilingualTTS:
    """Routes a language code to its fine-tuned voice and synthesises speech.

    This is the same code path python-services/stt-tts-service/main.py runs, so
    what you hear above is what the API returns. Checkpoints are loaded lazily
    and cached, because holding seven VITS models resident costs ~2 GB for
    voices a given request will never ask for.
    """

    def __init__(self, checkpoints_root):
        self.root = Path(checkpoints_root)
        self._cache: Dict[str, Tuple[Any, Any, bool]] = {}

    @property
    def available(self) -> List[str]:
        return sorted(p.name for p in self.root.iterdir()
                      if p.is_dir() and (p / "config.json").exists())

    def _load(self, lang: str):
        if lang not in self._cache:
            from transformers import AutoTokenizer, VitsModel
            lang_dir = self.root / lang
            if not (lang_dir / "config.json").exists():
                raise ValueError(f"no fine-tuned voice for '{lang}'. Available: {self.available}")
            model = VitsModel.from_pretrained(str(lang_dir)).eval()
            tokenizer = AutoTokenizer.from_pretrained(str(lang_dir))
            # Trust the exported tokenizer's own flag first, and only fall back
            # to reading the json when the attribute is absent.
            is_uroman = bool(getattr(tokenizer, "is_uroman", None)) or tokenizer_is_uroman(lang_dir)
            self._cache[lang] = (model, tokenizer, is_uroman)
        return self._cache[lang]

    def synthesize(self, text: str, language: str, fallback: bool = True):
        """-> (float32 waveform in [-1, 1], sample_rate)."""
        if fallback and not (self.root / language / "config.json").exists():
            available = self.available
            if not available:
                raise RuntimeError(f"no voices found under {self.root}")
            language = "en" if "en" in available else available[0]

        model, tokenizer, is_uroman = self._load(language)
        if is_uroman:
            text = uromanize(text, UROMAN_LCODE.get(language))
        inputs = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            waveform = model(**inputs).waveform[0].float().cpu().numpy()
        return waveform, model.config.sampling_rate


# Example:
#   tts = MultilingualTTS(TTS_FINAL_ROOT)
#   audio, sr = tts.synthesize("Hello from the trained model.", "en")
print("\nDone. MultilingualTTS is ready — see the example at the bottom of this cell.")
