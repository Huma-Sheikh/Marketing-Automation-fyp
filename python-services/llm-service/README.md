# LLM Chat Service

## After Training

Place your GGUF model file in `models/`:
- `models/model-q4_K_M.gguf` — Llama 3.1 8B QLoRA fine-tuned model

Install llama-cpp-python:
```bash
pip install llama-cpp-python
```

Then rebuild:
```bash
docker-compose up -d --build llm-service
```

## Stub Mode

Without the model, returns scripted sales responses so you can test the call pipeline.
