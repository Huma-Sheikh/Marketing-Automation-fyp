"""HTTP routes for the STT/TTS service (thin handlers over ``app.speech``).

Response contract (relied on by nestjs-backend):
* ``/stt`` always answers 200; inference failures return ``{"text": "", "error": ...}``.
* ``/tts`` always answers 200 with ``audio/wav``; failures return a short silence.
"""
import logging

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response

from app import models
from app.audio import generate_silence_wav
from app.config import DEFAULT_LANGUAGE, ERROR_SILENCE_SECONDS, STUB_SILENCE_SECONDS
from app.schemas import TTSRequest
from app.speech import resolve_voice, synthesize_speech, transcribe_audio

logger = logging.getLogger(__name__)

router = APIRouter()

WAV_MEDIA_TYPE = "audio/wav"


@router.get("/health")
def health():
    """Report which models are loaded and whether the service is in stub mode."""
    return {
        "status": "ok",
        "stt_loaded": models.stt_model is not None,
        "tts_loaded": bool(models.tts_model),
        "tts_languages": sorted(models.tts_model.keys()) if models.tts_model else [],
        "tts_voice_source": models.tts_voice_source,
        "mode": "production" if models.stt_model and models.tts_model else "stub",
    }


@router.post("/stt")
async def transcribe(audio: UploadFile = File(...), language: str = Form(DEFAULT_LANGUAGE)):
    """Convert audio to text using the fine-tuned multilingual Whisper model."""
    if models.stt_model is None:
        # STUB: Return empty string until model is trained
        logger.info("STT stub called - return empty (model not loaded)")
        return {"text": "", "language": language, "mode": "stub"}

    try:
        audio_bytes = await audio.read()
        text = transcribe_audio(audio_bytes, language)
        return {"text": text, "language": language, "mode": "production"}
    except Exception as e:
        logger.error("STT error: %s", e)
        return {"text": "", "error": str(e)}


@router.post("/tts")
async def synthesize(request: TTSRequest):
    """Convert text to audio using the fine-tuned per-language VITS/MMS model."""
    if not models.tts_model:
        # STUB: Return minimal valid WAV silence
        logger.info("TTS stub called - returning silence")
        return Response(content=generate_silence_wav(STUB_SILENCE_SECONDS), media_type=WAV_MEDIA_TYPE)

    lang = resolve_voice(request.language)
    try:
        wav_bytes = synthesize_speech(request.text, lang)
        return Response(content=wav_bytes, media_type=WAV_MEDIA_TYPE)
    except Exception as e:
        logger.error("TTS error: %s", e)
        return Response(content=generate_silence_wav(ERROR_SILENCE_SECONDS), media_type=WAV_MEDIA_TYPE)
