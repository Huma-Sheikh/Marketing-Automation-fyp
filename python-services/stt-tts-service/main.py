"""Entry point for the STT/TTS service: ``uvicorn main:app --port 8001``.

Builds the FastAPI app from the ``app`` package. Models are loaded eagerly at
import time (Whisper now, TTS voices lazily per language on first use), exactly
as before the package split.

Backwards compatibility: ``test_main.py`` (and any ad-hoc scripts) patch
``main.stt_model`` / ``main.tts_model`` and call ``main._generate_silence_wav``.
The model globals now live in ``app.models``, so this module forwards reads and
writes of those names there.
"""
import logging
import sys
import types

from fastapi import FastAPI

from app import models
from app.audio import generate_silence_wav
from app.errors import register_exception_handlers
from app.routes import router

logging.basicConfig(level=logging.INFO)

models.load_models()

app = FastAPI(title="STT/TTS Service")
app.include_router(router)
register_exception_handlers(app)

# Legacy name kept for test_main.py.
_generate_silence_wav = generate_silence_wav

_FORWARDED_MODEL_ATTRS = frozenset({"stt_model", "stt_processor", "tts_model", "tts_voice_source"})


class _MainModule(types.ModuleType):
    """Module type that proxies the model globals to ``app.models``."""

    def __getattr__(self, name):
        if name in _FORWARDED_MODEL_ATTRS:
            return getattr(models, name)
        raise AttributeError(f"module {self.__name__!r} has no attribute {name!r}")

    def __setattr__(self, name, value):
        if name in _FORWARDED_MODEL_ATTRS:
            setattr(models, name, value)
        else:
            super().__setattr__(name, value)


sys.modules[__name__].__class__ = _MainModule
