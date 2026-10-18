"""Conversation logic (no FastAPI imports): reply generation, length clamping, qualification."""
import json
import logging
import re
from typing import List, Optional

from app import models
from app.config import (
    CHAT_HISTORY_TURNS,
    CHAT_TEMPERATURE,
    CHAT_TOP_P,
    MAX_CHAT_TOKENS,
    MAX_REPLY_SENTENCES,
    QUALIFY_MAX_NOTES_CHARS,
    QUALIFY_MAX_TOKENS,
    QUALIFY_MAX_TRANSCRIPT_CHARS,
    QUALIFY_TEMPERATURE,
)
from app.prompts import OUTCOMES, QUALIFY_SYSTEM_PROMPT, SALES_SYSTEM_PROMPT, build_system_prompt, company_to_dict
from app.schemas import ChatRequest

logger = logging.getLogger(__name__)


def clamp_sentences(text: str, limit: int = MAX_REPLY_SENTENCES) -> str:
    """
    Hard-cap the spoken reply length.

    The prompt asks for two sentences; a 1.5B model does not always comply, and
    on a voice call an over-long reply costs latency the 8s /chat budget does
    not have. This enforces it deterministically instead of hoping. A trailing
    fragment with no terminator is dropped rather than spoken half-finished.
    """
    if limit <= 0:
        return text
    # The terminator must be followed by whitespace or end-of-string. Splitting
    # on any '.' cuts "rated 4.9" into "rated 4." — prices and ratings are
    # exactly the facts a sales agent quotes, so this has to hold.
    parts = re.findall(r".*?[.!?](?=\s|$)", text, re.S)
    if not parts:
        return text.strip()
    return " ".join(p.strip() for p in parts[:limit]).strip()


def keyword_qualify(transcript: str) -> dict:
    """Deterministic fallback. Also the weak-supervision source the model was
    fine-tuned against, so model and fallback broadly agree."""
    low = transcript.lower()
    if any(w in low for w in ["not interested", "no thanks", "remove me", "stop calling"]):
        return {"outcome": "not-interested", "score": 10}
    if any(w in low for w in ["call back", "call me later", "better time", "next week"]):
        return {"outcome": "callback", "score": 60}
    if any(w in low for w in ["voicemail", "leave a message"]):
        return {"outcome": "voicemail", "score": 30}
    if any(w in low for w in ["yes", "interested", "tell me more", "send me", "schedule", "demo"]):
        return {"outcome": "qualified", "score": 85}
    return {"outcome": "contacted", "score": 40}


def generate_reply(request: ChatRequest) -> Optional[str]:
    """Generate the next sales-agent turn with the model; None if unavailable, empty or failed."""
    if models.llm is None:
        return None
    try:
        messages: List[dict] = [{
            "role": "system",
            "content": build_system_prompt(company_to_dict(request.company), SALES_SYSTEM_PROMPT),
        }]
        for msg in request.conversation_history[-CHAT_HISTORY_TURNS:]:
            messages.append({"role": msg.role, "content": msg.content})
        result = models.llm.create_chat_completion(
            messages=messages,
            max_tokens=min(request.max_tokens, MAX_CHAT_TOKENS),
            temperature=CHAT_TEMPERATURE, top_p=CHAT_TOP_P)
        text = clamp_sentences(result["choices"][0]["message"]["content"].strip())
        return text or None
    except Exception as e:
        logger.error("LLM chat error: %s", e)
        return None


def model_qualify(transcript: str, fallback_score: int) -> Optional[dict]:
    """Classify ``transcript`` with the model; None if unavailable or its output is unusable."""
    if models.llm is None:
        return None
    try:
        result = models.llm.create_chat_completion(
            messages=[
                {"role": "system", "content": QUALIFY_SYSTEM_PROMPT},
                {"role": "user", "content": "Transcript:\n" + transcript[:QUALIFY_MAX_TRANSCRIPT_CHARS]},
            ],
            max_tokens=QUALIFY_MAX_TOKENS, temperature=QUALIFY_TEMPERATURE)
        raw = result["choices"][0]["message"]["content"]
        match = re.search(r"\{.*?\}", raw, re.S)
        if match is None:
            logger.warning("LLM qualify error: no JSON object in model output")
            return None
        data = json.loads(match.group(0))
        if data.get("outcome") in OUTCOMES:
            score = int(max(0, min(100, float(data.get("score", fallback_score)))))
            notes = str(data.get("notes", ""))[:QUALIFY_MAX_NOTES_CHARS] or "model qualification"
            return {"outcome": data["outcome"], "score": score, "notes": notes, "mode": "model"}
        logger.warning("Model returned unknown outcome: %s", data.get("outcome"))
    except Exception as e:
        logger.warning("LLM qualify error: %s", e)
    return None
