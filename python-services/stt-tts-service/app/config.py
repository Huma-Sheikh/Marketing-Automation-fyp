"""Service configuration: every environment variable and tunable constant in one place.

Model layout matches what the training notebooks in
python-services/ml-training/colab_03_stt_whisper_multilingual.py and
colab_04_tts_mms_multilingual.py save to Google Drive:

    models/stt_model_final/            <- one Whisper checkpoint, all languages
    models/tts_model_final/<lang>/     <- one VITS checkpoint per language (en, ur, ar, de, ...)
    models/tts_model_base/<lang>/      <- the untouched facebook/mms-tts-* voices, re-saved
                                          so transformers 4.44.2 loads them intact
"""
import os
from typing import Dict, Optional, Tuple

# ── Paths ─────────────────────────────────────────────────────────────────────
MODELS_DIR: str = "models"
STT_DIR: str = os.path.join(MODELS_DIR, "stt_model_final")
TTS_DIR: str = os.path.join(MODELS_DIR, "tts_model_final")
TTS_BASE_DIR: str = os.path.join(MODELS_DIR, "tts_model_base")

# A voice directory only counts as usable when it holds one of these.
TTS_WEIGHT_FILES: Tuple[str, ...] = ("model.safetensors", "pytorch_model.bin")

# ── Environment ───────────────────────────────────────────────────────────────
# Comma-separated languages that should serve their fine-tuned voice instead of
# the base MMS voice ("all" = every language). Empty = base voices everywhere.
TTS_FINETUNED_LANGS: str = os.environ.get("TTS_FINETUNED_LANGS", "")
# Optional path to a perl uroman checkout; only used if the `uroman` pip
# package is not importable.
UROMAN_PATH: Optional[str] = os.environ.get("UROMAN")

# ── Inference constants ───────────────────────────────────────────────────────
STT_SAMPLE_RATE: int = 16000      # Whisper expects 16 kHz mono
STT_MAX_NEW_TOKENS: int = 225
DEFAULT_LANGUAGE: str = "en"

SILENCE_SAMPLE_RATE: int = 22050  # sample rate of the stub/fallback silence WAV
STUB_SILENCE_SECONDS: float = 0.5  # returned when no TTS voice is loaded
ERROR_SILENCE_SECONDS: float = 0.1  # returned when synthesis fails

# uroman disambiguates better when told the source language — the same map
# colab_04 uses, so romanization at inference matches romanization at training.
UROMAN_LCODE: Dict[str, str] = {
    "ar": "ara", "ur": "urd", "hi": "hin", "en": "eng",
    "de": "deu", "fr": "fra", "es": "spa",
}
