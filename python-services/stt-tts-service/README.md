# STT/TTS Service

## After Training

Models are trained in Colab by [python-services/ml-training/colab_03_stt_whisper_multilingual.py](../ml-training/colab_03_stt_whisper_multilingual.py)
(STT) and [colab_04_tts_mms_multilingual.py](../ml-training/colab_04_tts_mms_multilingual.py) (TTS),
which save to Google Drive. Copy those folders here as-is:

```
models/
├── stt_model_final/              # one Whisper checkpoint, covers all trained languages
│   ├── config.json
│   ├── model.safetensors
│   └── ...tokenizer files
└── tts_model_final/               # one VITS/MMS checkpoint PER language
    ├── en/
    │   ├── config.json
    │   ├── model.safetensors
    │   └── ...tokenizer files
    ├── ur/
    ├── ar/
    ├── de/
    └── ...
```

Each trainer is a single self-contained Colab cell — paste, run, done. There is no separate
requirements file or dataset doc to read alongside them; everything is inlined.

- `stt_model_final/` is exactly `FINAL_DIR` from colab_03 (section 11, "EXPORT + EVALUATE").
- `tts_model_final/<lang>/` are exactly `TTS_FINAL_ROOT/<lang>` from colab_04 (section 10,
  "PREVIEW + EXPORT FINAL VOICES") — copy whichever language subfolders you've trained; you
  don't need all of them at once, `/tts` falls back to English (or whatever's available) for a
  language it doesn't have a voice for.

Then rebuild the Docker container:
```bash
docker-compose up -d --build stt-tts
```

Check `/health` afterwards — `stt_loaded`, `tts_loaded`, and `tts_languages` confirm what
actually got picked up.

## Base vs fine-tuned voices

`models/tts_model_base/<lang>/` holds the untouched `facebook/mms-tts-*` voices, re-saved so
transformers 4.44.2 loads them intact (loaded straight from the Hub, 4.44.2 silently
random-initialises their WaveNet layers). These are served by default.

A language serves its fine-tuned voice from `tts_model_final/` only when listed in the
`TTS_FINETUNED_LANGS` env var (`en,de` or `all`), or when it has no base voice. `/health`
reports which one each language uses under `tts_voice_source`.

To decide, run the round-trip eval (TTS → Whisper → word error rate, lower is better):

```bash
python eval_tts.py          # or: python eval_tts.py en de
```

It prints a base-vs-fine-tuned WER table and the `TTS_FINETUNED_LANGS` value to use.

| lang | base MMS | v1 (all trainable) | v2 (frozen text side) |
|------|---------:|-------------------:|----------------------:|
| en   | 8%       | 25%                | **5%**                |
| fr   | 23%      | 55%                | **19%**               |
| de   | 27%      | 57%                | **24%**               |
| ar   | 40%      | 90%                | **37%**               |
| es   | 9%       | 37%                | 9% (tie → base)       |

12 utterances per language (6 sentences × 2 seeds), judged by `stt_model_final`. Current
setting: `TTS_FINETUNED_LANGS=ar,de,en,fr`.

## Running in Stub Mode (before models are ready)

The service runs in stub mode automatically if `models/stt_model_final/` or
`models/tts_model_final/<lang>/` aren't found (or if `torch`/`transformers` aren't installed).
Stub mode returns silence for TTS and empty string for STT.
This lets you test the full pipeline without trained models.

## Notes

- `/stt` expects a WAV file (any sample rate — it's resampled to 16kHz internally) and an
  optional `language` form field (ISO 639-1 code, e.g. `en`, `ur`, `ar`, `de`). An unrecognized
  code falls back to Whisper's own language auto-detection instead of erroring.
- `/tts` expects `{"text": ..., "language": ...}`. Arabic-script voices (Arabic, Urdu) are
  romanized before tokenizing if their `tokenizer_config.json` says `"is_uroman": true`. This
  must match the preprocessing used at training time — those checkpoints were trained on
  romanized text, and feeding them native script produces near-noise rather than a worse accent.
  Romanization uses the pure-Python `uroman` package (in `requirements.txt`), so no perl and no
  cloned repo are needed; `app/romanize.py:uromanize()` still honours a `UROMAN` env var pointing at a perl
  uroman checkout if you have one.

## Code layout

```
main.py            entry point: loads models, builds FastAPI(), includes the router (uvicorn main:app)
app/config.py      every env var + constant (paths, sample rates, uroman language map)
app/schemas.py     Pydantic request models (TTSRequest)
app/models.py      model state + loading (Whisper eager at import, TTS voices lazily per language)
app/speech.py      transcription / synthesis logic (no FastAPI imports)
app/romanize.py    uroman romanization for is_uroman voices
app/audio.py       WAV encoding helpers (silence, float waveform -> PCM16)
app/routes.py      thin HTTP handlers
app/errors.py      catch-all JSON 500 handler
```

`main.py` still exposes `stt_model` / `tts_model` / `_generate_silence_wav` for `test_main.py`;
assignments to the model names are forwarded to `app.models`.

## Environment variables

See `.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `TTS_FINETUNED_LANGS` | `""` | Languages (comma list or `all`) that serve the fine-tuned voice instead of the base MMS voice |
| `UROMAN` | unset | Path to a perl uroman checkout; fallback when the `uroman` package is missing |

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | – | `{status, stt_loaded, tts_loaded, tts_languages, tts_voice_source, mode}` |
| POST | `/stt` | multipart `audio` file + optional `language` form field (default `en`) | `{text, language, mode}`; on inference error `{text: "", error}` (still 200) |
| POST | `/tts` | `{"text": str, "language": "en"}` | `audio/wav`; silence in stub mode or on error |

## Run & test

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
python -m pytest -q          # test_main.py, forces stub mode
```
