"""Speech inference logic (no FastAPI imports): transcription and synthesis.

These functions assume the relevant model is loaded; the routes decide when to
fall back to stub responses. Heavy libraries (torch, librosa) are imported
lazily so the service still starts in stub mode without them.
"""
import io
import logging

from app import models
from app.audio import waveform_to_wav_bytes
from app.config import STT_MAX_NEW_TOKENS, STT_SAMPLE_RATE, UROMAN_LCODE
from app.romanize import uromanize

logger = logging.getLogger(__name__)


def transcribe_audio(audio_bytes: bytes, language: str) -> str:
    """Transcribe raw audio bytes (any format librosa reads) with the loaded Whisper model."""
    import librosa
    import torch

    waveform, _ = librosa.load(io.BytesIO(audio_bytes), sr=STT_SAMPLE_RATE, mono=True)
    inputs = models.stt_processor.feature_extractor(
        waveform, sampling_rate=STT_SAMPLE_RATE, return_tensors="pt"
    )

    # `language=`/`task=` kwargs rather than forced_decoder_ids: the latter is
    # deprecated on Whisper's generate() and conflicts with the model's own
    # generation_config, which the trainer leaves unpinned so the checkpoint
    # stays multilingual. An unrecognized code raises, and we fall back to
    # Whisper's built-in language detection rather than failing the request.
    gen_kwargs = {"task": "transcribe", "max_new_tokens": STT_MAX_NEW_TOKENS}
    if language:
        gen_kwargs["language"] = language

    with torch.no_grad():
        try:
            generated_ids = models.stt_model.generate(inputs.input_features, **gen_kwargs)
        except ValueError:
            logger.warning("STT: unrecognized language '%s' — letting Whisper auto-detect it", language)
            gen_kwargs.pop("language", None)
            generated_ids = models.stt_model.generate(inputs.input_features, **gen_kwargs)
    return models.stt_processor.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()


def resolve_voice(language: str) -> str:
    """Return ``language`` if a voice exists for it, else the English (or first available) voice."""
    if language in models.tts_model:
        return language
    fallback = "en" if "en" in models.tts_model else next(iter(models.tts_model))
    logger.warning("TTS: no fine-tuned voice for '%s' — falling back to '%s'", language, fallback)
    return fallback


def synthesize_speech(text: str, lang: str) -> bytes:
    """Synthesize ``text`` with the voice for ``lang`` and return 16-bit PCM WAV bytes."""
    import torch

    model, tokenizer, is_uroman = models.load_tts_lang(lang)
    if is_uroman:
        text = uromanize(text, UROMAN_LCODE.get(lang))

    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform[0].cpu().numpy()
    return waveform_to_wav_bytes(waveform, model.config.sampling_rate)
