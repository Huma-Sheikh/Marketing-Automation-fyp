import os
import io
import json
import logging
import subprocess
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="STT/TTS Service")

# ── Model loading (stub mode if files not found) ──────────────────────────────
# Model layout matches what the training notebooks in
# python-services/ml-training/colab_03_stt_whisper_multilingual.py and
# colab_04_tts_mms_multilingual.py save to Google Drive:
#   models/stt_model_final/            <- one Whisper checkpoint, all languages
#   models/tts_model_final/<lang>/     <- one VITS checkpoint per language (en, ur, ar, de, ...)
#   models/tts_model_base/<lang>/      <- the untouched facebook/mms-tts-* voices, re-saved
#                                         so transformers 4.44.2 loads them intact
stt_model = None
stt_processor = None
tts_model = None  # dict of {lang: checkpoint_dir} once loaded, else None
tts_voice_source = {}  # lang -> "base" | "finetuned"
MODELS_DIR = "models"
STT_DIR = os.path.join(MODELS_DIR, "stt_model_final")
TTS_DIR = os.path.join(MODELS_DIR, "tts_model_final")
TTS_BASE_DIR = os.path.join(MODELS_DIR, "tts_model_base")
TTS_FINETUNED_LANGS = os.environ.get("TTS_FINETUNED_LANGS", "")
UROMAN_PATH = os.environ.get("UROMAN")
TTS_WEIGHT_FILES = ("model.safetensors", "pytorch_model.bin")

_tts_cache = {}  # lang -> (model, tokenizer, is_uroman), populated lazily on first /tts call
_uroman_instance = None  # pure-Python romanizer; built once, it loads data files


def load_models():
    global stt_model, stt_processor, tts_model

    if os.path.exists(os.path.join(STT_DIR, "config.json")):
        try:
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
            stt_processor = WhisperProcessor.from_pretrained(STT_DIR)
            stt_model = WhisperForConditionalGeneration.from_pretrained(STT_DIR)
            stt_model.eval()
            logger.info("STT model (Whisper) loaded from " + STT_DIR)
        except Exception as e:
            logger.warning(f"STT model load failed: {e}")
    else:
        logger.info("STT model not found - running in stub mode")

    base = _scan_voices(TTS_BASE_DIR)
    tuned = _scan_voices(TTS_DIR)
    # Base MMS voices by default: in the round-trip eval (eval_tts.py) every
    # fine-tuned voice from colab_04 v1 was less intelligible than its base.
    # A language uses its fine-tuned voice only when listed in
    # TTS_FINETUNED_LANGS ("all" = every one), or when it has no base voice.
    wanted = {l.strip() for l in TTS_FINETUNED_LANGS.split(",") if l.strip()}
    langs = {}
    for lang in sorted(set(base) | set(tuned)):
        use_tuned = lang in tuned and ("all" in wanted or lang in wanted or lang not in base)
        langs[lang] = tuned[lang] if use_tuned else base[lang]
        tts_voice_source[lang] = "finetuned" if use_tuned else "base"
    if langs:
        tts_model = langs
        logger.info(f"TTS voices available: {tts_voice_source}")
    else:
        logger.info("TTS model not found - running in stub mode")


def _scan_voices(root: str) -> dict:
    """{lang: dir} for every <root>/<lang>/ that has a config AND a weights file."""
    found = {}
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
            logger.warning(f"TTS voice '{lang_dir}' has no weights file - skipping")
            continue
        found[name] = lang_dir
    return found


load_models()


def _load_tts_lang(lang: str):
    """Lazily load + cache the VITS checkpoint for one language."""
    if lang in _tts_cache:
        return _tts_cache[lang]

    from transformers import VitsModel, AutoTokenizer
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


# uroman disambiguates better when told the source language — the same map
# colab_04 uses, so romanization at inference matches romanization at training.
UROMAN_LCODE = {"ar": "ara", "ur": "urd", "hi": "hin", "en": "eng",
                "de": "deu", "fr": "fra", "es": "spa"}


def _uromanize(text: str, lcode: str = None) -> str:
    """Romanize non-Latin script text before tokenizing.

    Required by the MMS-TTS checkpoints fine-tuned on non-Latin scripts
    (Arabic/Urdu), whose tokenizer_config.json says "is_uroman": true. This MUST
    match what the trainer did — feeding those voices native script instead of
    romanized text produces near-noise, not a slightly worse accent.

    Resolution order mirrors colab_04's `uromanize()`: the pure-Python `uroman`
    package first, then a perl uroman checkout via $UROMAN. The Python package
    is why the Dockerfile no longer needs to clone a perl repo; the perl path
    stays as a fallback for existing images that still have one.
    """
    try:
        import uroman as uroman_pkg
        global _uroman_instance
        if _uroman_instance is None:
            _uroman_instance = uroman_pkg.Uroman()
        return _uroman_instance.romanize_string(text, lcode=lcode).strip()
    except ImportError:
        pass

    if not UROMAN_PATH:
        raise RuntimeError(
            "This voice requires uroman preprocessing, but neither the `uroman` Python package "
            "nor the UROMAN env var is available. Run `pip install uroman`, or set UROMAN to the "
            "path of a cloned https://github.com/isi-nlp/uroman checkout."
        )
    script_path = os.path.join(UROMAN_PATH, "bin", "uroman.pl")
    process = subprocess.Popen(
        ["perl", script_path] + (["-l", lcode] if lcode else []),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    stdout, stderr = process.communicate(input=text.encode())
    if process.returncode != 0:
        raise ValueError(f"uroman failed ({process.returncode}): {stderr.decode()}")
    return stdout.decode().strip()


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "stt_loaded": stt_model is not None,
        "tts_loaded": bool(tts_model),
        "tts_languages": sorted(tts_model.keys()) if tts_model else [],
        "tts_voice_source": tts_voice_source,
        "mode": "production" if stt_model and tts_model else "stub"
    }

@app.post("/stt")
async def transcribe(audio: UploadFile = File(...), language: str = Form("en")):
    """Convert audio to text using the fine-tuned multilingual Whisper model."""
    if stt_model is None:
        # STUB: Return empty string until model is trained
        logger.info("STT stub called - return empty (model not loaded)")
        return {"text": "", "language": language, "mode": "stub"}

    try:
        import torch
        import librosa

        audio_bytes = await audio.read()
        waveform, _ = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)

        inputs = stt_processor.feature_extractor(waveform, sampling_rate=16000, return_tensors="pt")

        # `language=`/`task=` kwargs rather than forced_decoder_ids: the latter is
        # deprecated on Whisper's generate() and conflicts with the model's own
        # generation_config, which the trainer leaves unpinned so the checkpoint
        # stays multilingual. An unrecognized code raises, and we fall back to
        # Whisper's built-in language detection rather than failing the request.
        gen_kwargs = {"task": "transcribe", "max_new_tokens": 225}
        if language:
            gen_kwargs["language"] = language

        with torch.no_grad():
            try:
                generated_ids = stt_model.generate(inputs.input_features, **gen_kwargs)
            except ValueError:
                logger.warning(f"STT: unrecognized language '{language}' — letting Whisper auto-detect it")
                gen_kwargs.pop("language", None)
                generated_ids = stt_model.generate(inputs.input_features, **gen_kwargs)
        text = stt_processor.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()

        return {"text": text, "language": language, "mode": "production"}
    except Exception as e:
        logger.error(f"STT error: {e}")
        return {"text": "", "error": str(e)}

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

@app.post("/tts")
async def synthesize(request: TTSRequest):
    """Convert text to audio using the fine-tuned per-language VITS/MMS model."""
    if not tts_model:
        # STUB: Return minimal valid WAV silence
        logger.info("TTS stub called - returning silence")
        silence = _generate_silence_wav(0.5)
        return Response(content=silence, media_type="audio/wav")

    lang = request.language
    if lang not in tts_model:
        fallback = "en" if "en" in tts_model else next(iter(tts_model))
        logger.warning(f"TTS: no fine-tuned voice for '{lang}' — falling back to '{fallback}'")
        lang = fallback

    try:
        import torch

        model, tokenizer, is_uroman = _load_tts_lang(lang)
        text = _uromanize(request.text, UROMAN_LCODE.get(lang)) if is_uroman else request.text

        inputs = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            waveform = model(**inputs).waveform[0].cpu().numpy()

        wav_bytes = _waveform_to_wav_bytes(waveform, model.config.sampling_rate)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        silence = _generate_silence_wav(0.1)
        return Response(content=silence, media_type="audio/wav")

def _generate_silence_wav(duration_seconds: float = 0.5, sample_rate: int = 22050) -> bytes:
    """Generate a minimal WAV file with silence."""
    num_samples = int(sample_rate * duration_seconds)
    samples = np.zeros(num_samples, dtype=np.int16)
    buf = io.BytesIO()
    import wave
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(samples.tobytes())
    return buf.getvalue()

def _waveform_to_wav_bytes(waveform: np.ndarray, sample_rate: int) -> bytes:
    """Convert a float32 [-1, 1] waveform (VITS output) to 16-bit PCM WAV bytes."""
    clipped = np.clip(waveform, -1.0, 1.0)
    samples = (clipped * 32767).astype(np.int16)
    buf = io.BytesIO()
    import wave
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(samples.tobytes())
    return buf.getvalue()
