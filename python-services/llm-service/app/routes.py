"""HTTP routes for the LLM service (thin handlers over ``app.conversation``).

Both POST routes always answer 200: when the model is missing or fails they
return a scripted / keyword-based result with ``"mode": "stub"``.
"""
import random

from fastapi import APIRouter

from app import models
from app.config import MODEL_FILE
from app.conversation import generate_reply, keyword_qualify, model_qualify
from app.prompts import SALES_RESPONSES
from app.schemas import ChatRequest, QualifyRequest

router = APIRouter()


@router.get("/health")
def health():
    """Report whether the GGUF model is loaded."""
    return {"status": "ok", "llm_loaded": models.llm is not None,
            "mode": "production" if models.llm else "stub", "model": MODEL_FILE}


@router.post("/chat")
async def chat(request: ChatRequest):
    """Generate the next sales-agent turn from the conversation history."""
    text = generate_reply(request)
    if text:
        return {"response": text, "mode": "model"}
    return {"response": random.choice(SALES_RESPONSES), "mode": "stub"}


@router.post("/qualify")
async def qualify(request: QualifyRequest):
    """Classify a call transcript into the outcome enum the backend expects."""
    fallback = keyword_qualify(request.transcript)
    result = model_qualify(request.transcript, fallback["score"])
    if result is not None:
        return result
    return {**fallback, "notes": "keyword-based qualification", "mode": "stub"}
