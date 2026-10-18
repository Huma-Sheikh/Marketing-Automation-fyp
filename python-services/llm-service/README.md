# LLM Chat Service

FastAPI service on port **8004**. Generates sales-agent replies (`/chat`) and classifies call
transcripts (`/qualify`) with a quantised GGUF model via llama-cpp-python.

## After Training

Place your GGUF model file in `models/`:
- `models/model-q4_K_M.gguf` — produced by `ml-training/colab_05_llm_sales_brain.py`

Install llama-cpp-python:
```bash
pip install llama-cpp-python
```

Then rebuild:
```bash
docker-compose up -d --build llm-service
```

## Stub Mode

Without the model, returns scripted sales responses and keyword-based qualification so you can
test the call pipeline (`"mode": "stub"`).

## Code layout

```
main.py              entry point: loads the model, builds FastAPI(), includes the router (uvicorn main:app)
app/config.py        every env var + constant (model path, threads, token/sentence/prompt limits)
app/schemas.py       Pydantic request models (Message, CompanyProfile, ChatRequest, QualifyRequest)
app/models.py        model state + loading (eager at import)
app/prompts.py       system prompts, scripted replies, outcome enum, tenant-aware prompt builder
app/conversation.py  reply generation, sentence clamping, model/keyword qualification (no FastAPI imports)
app/routes.py        thin HTTP handlers
app/errors.py        catch-all JSON 500 handler
```

## Environment variables

See `.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_THREADS` | `4` | CPU threads for llama.cpp |
| `LLM_MAX_SENTENCES` | `2` | Max sentences in a `/chat` reply (`<= 0` disables) |
| `LLM_MAX_CHAT_TOKENS` | `80` | Upper bound on generated tokens per `/chat` turn |

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | – | `{status, llm_loaded, mode, model}` |
| POST | `/chat` | `{conversation_history: [{role, content}], max_tokens=150, company?: CompanyProfile}` | `{response, mode: "model"\|"stub"}` |
| POST | `/qualify` | `{transcript}` | `{outcome, score, notes, mode}`; outcome ∈ qualified, not-interested, callback, voicemail, contacted |

## Run & test

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8004
```

There is no test suite yet. `from app import conversation, prompts` imports the pure logic
without loading the ~1 GB model (importing `main` loads it).
