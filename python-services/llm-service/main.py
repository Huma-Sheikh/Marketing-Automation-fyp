import os
import logging
import random
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLM Chat Service")

MODELS_DIR = "models"
llm = None

def load_models():
    global llm
    model_path = os.path.join(MODELS_DIR, "model-q4_K_M.gguf")
    if os.path.exists(model_path):
        try:
            from llama_cpp import Llama
            llm = Llama(
                model_path=model_path,
                n_ctx=2048,
                n_threads=4,
                verbose=False,
            )
            logger.info("Llama model loaded from " + model_path)
        except Exception as e:
            logger.warning(f"LLM load failed (install llama-cpp-python): {e}")
    else:
        logger.info("LLM model not found - running in stub mode")

load_models()

# Scripted responses for stub mode
SALES_RESPONSES = [
    "That's great to hear! We help businesses like yours generate more leads and close more deals through AI-powered outreach. Would you be open to a quick demo this week?",
    "I completely understand. Many of our clients felt the same way initially. What if I told you we could show you results within the first 30 days, or your money back?",
    "Absolutely! We have helped companies in your industry increase their lead conversion rate by an average of 40 percent. What's your biggest challenge with lead generation right now?",
    "That makes sense. Our platform automates the entire outreach process so your team can focus on closing deals instead of cold calling. Can I send you some case studies?",
    "Perfect timing actually. We're running a special offer this month. Would Thursday or Friday work better for a 15-minute call with our solutions team?",
]

QUALIFY_OUTCOMES = ["qualified", "not-interested", "callback", "voicemail", "contacted"]

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    conversation_history: List[Message]
    max_tokens: int = 150

class QualifyRequest(BaseModel):
    transcript: str

@app.get("/health")
def health():
    return {"status": "ok", "llm_loaded": llm is not None, "mode": "production" if llm else "stub"}

@app.post("/chat")
async def chat(request: ChatRequest):
    """Generate sales agent response given conversation history."""
    if llm is not None:
        try:
            # Build prompt from conversation history
            system_prompt = """You are a professional AI sales agent for a marketing platform.
Be conversational, friendly, and concise. Ask qualifying questions.
Keep responses under 2 sentences. Never be pushy."""

            messages = [{"role": "system", "content": system_prompt}]
            for msg in request.conversation_history[-6:]:  # Last 6 turns
                messages.append({"role": msg.role, "content": msg.content})

            result = llm.create_chat_completion(
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=0.7,
                stop=["\n\n"],
            )
            response = result["choices"][0]["message"]["content"].strip()
            return {"response": response, "mode": "model"}
        except Exception as e:
            logger.error(f"LLM chat error: {e}")

    # Stub: return scripted response
    response = random.choice(SALES_RESPONSES)
    return {"response": response, "mode": "stub"}

@app.post("/qualify")
async def qualify(request: QualifyRequest):
    """Analyze call transcript to determine lead outcome."""
    transcript_lower = request.transcript.lower()

    # Simple keyword-based qualification (works without LLM)
    if any(w in transcript_lower for w in ["not interested", "no thanks", "remove me", "stop calling"]):
        outcome = "not-interested"
        score = 10
    elif any(w in transcript_lower for w in ["call back", "call me later", "better time", "next week"]):
        outcome = "callback"
        score = 60
    elif any(w in transcript_lower for w in ["yes", "interested", "tell me more", "send me", "schedule", "demo"]):
        outcome = "qualified"
        score = 85
    elif any(w in transcript_lower for w in ["voicemail", "leave a message"]):
        outcome = "voicemail"
        score = 30
    else:
        outcome = "contacted"
        score = 40

    if llm is not None:
        try:
            prompt = f"""Analyze this sales call transcript and respond with JSON only.
Transcript: {request.transcript[:500]}
Respond: {{"outcome": "qualified|not-interested|callback|voicemail|contacted", "score": 0-100, "notes": "brief reason"}}"""
            result = llm(prompt, max_tokens=100, stop=["\n"])
            import json
            data = json.loads(result["choices"][0]["text"].strip())
            return {**data, "mode": "model"}
        except Exception as e:
            logger.warning(f"LLM qualify error: {e}")

    return {"outcome": outcome, "score": score, "notes": "keyword-based qualification", "mode": "stub"}
