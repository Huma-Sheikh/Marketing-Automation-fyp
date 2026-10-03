"""
Unit + integration tests for the STT/TTS FastAPI service.
Runs entirely in stub mode (no real models required).
Run: pytest python-services/stt-tts-service/test_main.py -v
"""

import io
import wave
import struct
import pytest
from fastapi.testclient import TestClient

# Patch model globals to None before importing app so tests always run in stub mode
import main as app_module

app_module.stt_model = None
app_module.tts_model = None

from main import app

client = TestClient(app)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_wav_bytes(duration: float = 0.1, sample_rate: int = 16000) -> bytes:
    """Create a minimal valid WAV file in memory."""
    num_samples = int(sample_rate * duration)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))
    buf.seek(0)
    return buf.read()


# ─── /health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_status_is_ok(self):
        resp = client.get("/health")
        assert resp.json()["status"] == "ok"

    def test_stt_loaded_false_in_stub_mode(self):
        resp = client.get("/health")
        assert resp.json()["stt_loaded"] is False

    def test_tts_loaded_false_in_stub_mode(self):
        resp = client.get("/health")
        assert resp.json()["tts_loaded"] is False

    def test_mode_is_stub(self):
        resp = client.get("/health")
        assert resp.json()["mode"] == "stub"

    def test_health_response_has_all_required_fields(self):
        resp = client.get("/health")
        data = resp.json()
        assert "status" in data
        assert "stt_loaded" in data
        assert "tts_loaded" in data
        assert "mode" in data


# ─── /stt ─────────────────────────────────────────────────────────────────────

class TestStt:
    def test_returns_200_with_audio_file(self):
        wav_bytes = _make_wav_bytes()
        resp = client.post(
            "/stt",
            files={"audio": ("test.wav", wav_bytes, "audio/wav")},
            data={"language": "en"},
        )
        assert resp.status_code == 200

    def test_stub_mode_returns_empty_text(self):
        wav_bytes = _make_wav_bytes()
        resp = client.post(
            "/stt",
            files={"audio": ("test.wav", wav_bytes, "audio/wav")},
            data={"language": "en"},
        )
        data = resp.json()
        assert data["text"] == ""

    def test_stub_mode_returns_mode_stub(self):
        wav_bytes = _make_wav_bytes()
        resp = client.post(
            "/stt",
            files={"audio": ("test.wav", wav_bytes, "audio/wav")},
            data={"language": "en"},
        )
        assert resp.json()["mode"] == "stub"

    def test_returns_requested_language(self):
        wav_bytes = _make_wav_bytes()
        resp = client.post(
            "/stt",
            files={"audio": ("test.wav", wav_bytes, "audio/wav")},
            data={"language": "ar"},
        )
        assert resp.json()["language"] == "ar"

    def test_default_language_is_en(self):
        wav_bytes = _make_wav_bytes()
        resp = client.post(
            "/stt",
            files={"audio": ("test.wav", wav_bytes, "audio/wav")},
        )
        # language defaults to "en" per Form default
        assert resp.json()["language"] == "en"

    def test_requires_audio_field(self):
        resp = client.post("/stt", data={"language": "en"})
        assert resp.status_code == 422  # Unprocessable Entity — missing file


# ─── /tts ─────────────────────────────────────────────────────────────────────

class TestTts:
    def test_returns_200(self):
        resp = client.post("/tts", json={"text": "Hello world", "language": "en"})
        assert resp.status_code == 200

    def test_returns_audio_wav_content_type(self):
        resp = client.post("/tts", json={"text": "Test", "language": "en"})
        assert "audio/wav" in resp.headers.get("content-type", "")

    def test_returns_non_empty_wav_bytes(self):
        resp = client.post("/tts", json={"text": "Hello", "language": "en"})
        assert len(resp.content) > 0

    def test_response_is_valid_wav_structure(self):
        resp = client.post("/tts", json={"text": "Test audio", "language": "en"})
        # WAV files start with RIFF header
        assert resp.content[:4] == b"RIFF"

    def test_requires_text_field(self):
        resp = client.post("/tts", json={"language": "en"})
        assert resp.status_code == 422

    def test_empty_text_still_returns_wav(self):
        resp = client.post("/tts", json={"text": "", "language": "en"})
        assert resp.status_code == 200
        assert len(resp.content) > 0

    def test_long_text_returns_wav(self):
        long_text = "This is a very long piece of text. " * 20
        resp = client.post("/tts", json={"text": long_text, "language": "en"})
        assert resp.status_code == 200


# ─── _generate_silence_wav helper ────────────────────────────────────────────

class TestGenerateSilenceWav:
    def test_generates_valid_wav_bytes(self):
        wav = app_module._generate_silence_wav(0.5)
        assert isinstance(wav, bytes)
        assert wav[:4] == b"RIFF"

    def test_duration_affects_file_size(self):
        short = app_module._generate_silence_wav(0.1)
        long = app_module._generate_silence_wav(1.0)
        assert len(long) > len(short)

    def test_default_duration_produces_valid_wav(self):
        wav = app_module._generate_silence_wav()
        buf = io.BytesIO(wav)
        with wave.open(buf, "rb") as w:
            assert w.getnchannels() == 1
            assert w.getsampwidth() == 2
            assert w.getframerate() == 22050
