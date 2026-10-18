"""WAV encoding helpers (pure numpy + stdlib, no model or FastAPI imports)."""
import io
import wave

import numpy as np

from app.config import SILENCE_SAMPLE_RATE


def _pcm16_to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Wrap mono int16 PCM samples in a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(samples.tobytes())
    return buf.getvalue()


def generate_silence_wav(duration_seconds: float = 0.5, sample_rate: int = SILENCE_SAMPLE_RATE) -> bytes:
    """Generate a minimal WAV file with silence."""
    num_samples = int(sample_rate * duration_seconds)
    return _pcm16_to_wav_bytes(np.zeros(num_samples, dtype=np.int16), sample_rate)


def waveform_to_wav_bytes(waveform: np.ndarray, sample_rate: int) -> bytes:
    """Convert a float32 [-1, 1] waveform (VITS output) to 16-bit PCM WAV bytes."""
    clipped = np.clip(waveform, -1.0, 1.0)
    return _pcm16_to_wav_bytes((clipped * 32767).astype(np.int16), sample_rate)
