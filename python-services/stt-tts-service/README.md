# STT/TTS Service

## After Training

Place your trained model files in the `models/` directory:
- `models/stt_model_final.pth` — DeepSpeech2 model
- `models/tts_final.pth` — Tacotron2-Lite model

Then rebuild the Docker container:
```bash
docker-compose up -d --build stt-tts
```

## Running in Stub Mode (before models are ready)

The service runs in stub mode automatically if model files are not found.
Stub mode returns silence for TTS and empty string for STT.
This lets you test the full pipeline without trained models.
