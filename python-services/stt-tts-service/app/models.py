"""Model state and loading for the STT (Whisper) and TTS (VITS/MMS) checkpoints.

The module-level globals below are the single source of truth the routes read.
``load_models()`` is called once at import time of ``main`` (eager, as before):
Whisper loads immediately, while each TTS voice is loaded lazily on its first
``/tts`` request via ``load_tts_lang()``. Missing files leave everything at
``None`` and the service runs in stub mode.
"""
import json
import logging
import os
from typing import Any, Dict, Optional, Tuple

from app.config import STT_DIR, TTS_BASE_DIR, TTS_DIR, TTS_FINETUNED_LANGS, TTS_WEIGHT_FILES

logger = logging.getLogger(__name__)

stt_model: Any = None
stt_processor: Any = None
tts_model: Optional[Dict[str, str]] = None  # {lang: checkpoint_dir} once loaded, else None
tts_voice_source: Dict[str, str] = {}       # lang -> "base" | "finetuned"

# lang -> (model, tokenizer, is_uroman), populated lazily on first /tts call
_tts_cache: Dict[str, Tuple[Any, Any, bool]] = {}


def scan_voices(root: str) -> Dict[str, str]:
    """Return ``{lang: dir}`` for every ``<root>/<lang>/`` that has a config AND a weights file."""
    found: Dict[str, str] = {}
    if not os.path.isdir(root):
        return found
    for name in sorted(os.listdir(root)):
        lang_dir = os.path.join(root, name)
        if not os.path.exists(os.path.join(lang_dir, "config.json")):
            continue
        # A folder with config + tokenizer but no weights is a partial copy
        # (e.g. a Drive zip download that dropped the large files). Listing
        # it would make /health claim the voice and /tts return silence.
        if not any(os.path.exists(os.path.join(lang_dir, w)) for w in TTS_WEIGHT_FILES):
            logger.warning("TTS voice '%s' has no weights file - skipping", lang_dir)
            continue
        found[name] = lang_dir
    return found


def load_models() -> None:
    """Load Whisper eagerly and register the available TTS voices (loaded lazily later)."""
    global stt_model, stt_processor, tts_model

    if os.path.exists(os.path.join(STT_DIR, "config.json")):
        try:
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
            stt_processor = WhisperProcessor.from_pretrained(STT_DIR)
            stt_model = WhisperForConditionalGeneration.from_pretrained(STT_DIR)
            stt_model.eval()
            logger.info("STT model (Whisper) loaded from %s", STT_DIR)
        except Exception as e:
            logger.warning("STT model load failed: %s", e)
    else:
        logger.info("STT model not found - running in stub mode")

    base = scan_voices(TTS_BASE_DIR)
    tuned = scan_voices(TTS_DIR)
    # Base MMS voices by default: in the round-trip eval (eval_tts.py) every
    # fine-tuned voice from colab_04 v1 was less intelligible than its base.
    # A language uses its fine-tuned voice only when listed in
    # TTS_FINETUNED_LANGS ("all" = every one), or when it has no base voice.
    wanted = {lang.strip() for lang in TTS_FINETUNED_LANGS.split(",") if lang.strip()}
    langs: Dict[str, str] = {}
    for lang in sorted(set(base) | set(tuned)):
        use_tuned = lang in tuned and ("all" in wanted or lang in wanted or lang not in base)
        langs[lang] = tuned[lang] if use_tuned else base[lang]
        tts_voice_source[lang] = "finetuned" if use_tuned else "base"
    if langs:
        tts_model = langs
        logger.info("TTS voices available: %s", tts_voice_source)
    else:
        logger.info("TTS model not found - running in stub mode")


def load_tts_lang(lang: str) -> Tuple[Any, Any, bool]:
    """Lazily load + cache the VITS checkpoint for one language."""
    if lang in _tts_cache:
        return _tts_cache[lang]

    from transformers import AutoTokenizer, VitsModel
    lang_dir = tts_model[lang]
    model = VitsModel.from_pretrained(lang_dir)
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(lang_dir)

    is_uroman = False
    tok_cfg_path = os.path.join(lang_dir, "tokenizer_config.json")
    if os.path.exists(tok_cfg_path):
        with open(tok_cfg_path) as f:
            is_uroman = json.load(f).get("is_uroman", False)

    _tts_cache[lang] = (model, tokenizer, is_uroman)
    return _tts_cache[lang]
