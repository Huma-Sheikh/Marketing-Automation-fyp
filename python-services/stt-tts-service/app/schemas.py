"""Pydantic request models for the STT/TTS routes."""
from pydantic import BaseModel

from app.config import DEFAULT_LANGUAGE


class TTSRequest(BaseModel):
    """Body of ``POST /tts``."""

    text: str
    language: str = DEFAULT_LANGUAGE
