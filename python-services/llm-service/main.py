import json
import logging
import os
import random
import re
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLM Chat Service")

MODELS_DIR = "models"
MODEL_FILE = os.path.join(MODELS_DIR, "model-q4_K_M.gguf")
N_THREADS = int(os.getenv("LLM_THREADS", "4"))

SALES_SYSTEM_PROMPT = "You are a professional AI sales agent for an AI marketing automation platform. Be warm, natural and concise. Reply in at most 2 short sentences, then ask one qualifying question. Never be pushy, never invent pricing, and always respect a clear no."

QUALIFY_SYSTEM_PROMPT = "You analyse sales call transcripts. Reply with ONE line of strict JSON and nothing else: {\"outcome\": \"qualified|not-interested|callback|voicemail|contacted\", \"score\": 0-100, \"notes\": \"brief reason\"}"

OUTCOMES = ["qualified", "not-interested", "callback", "voicemail", "contacted"]

llm = None


def load_models():
    global llm
    if not os.path.exists(MODEL_FILE):
        logger.info("LLM model not found - running in stub mode")
        return
    try:
        from llama_cpp import Llama
        llm = Llama(model_path=MODEL_FILE, n_ctx=2048, n_threads=N_THREADS,
                    verbose=False)
        logger.info("Llama model loaded from " + MODEL_FILE)
    except Exception as e:
        logger.warning("LLM load failed (install llama-cpp-python): %s", e)


load_models()

SALES_RESPONSES = [
    "That is great to hear! We help businesses like yours generate more leads through AI-powered outreach. Would you be open to a quick demo this week?",
    "I completely understand. What if we could show you results within the first 30 days?",
    "Absolutely. What is your biggest challenge with lead generation right now?",
    "That makes sense. Our platform automates outreach so your team can focus on closing. Can I send you some case studies?",
    "Perfect timing. Would Thursday or Friday work better for a 15-minute call?",
]


class Message(BaseModel):
    role: str
    content: str


class CompanyProfile(BaseModel):
    """
    Per-tenant facts, supplied by the backend on every /chat call.

    This is how one shared model serves every company. Fine-tuning per tenant
    would mean a ~1GB GGUF and hours of GPU each, rebuilt whenever a customer
    edits their own data; injecting their facts into the system prompt costs
    nothing and takes effect the moment they save the form.

    Only FACTS belong here. The behavioural rules (two sentences, never invent
    pricing, respect a no) stay server-side in SALES_SYSTEM_PROMPT so a tenant
    cannot edit away the guardrails that keep calls compliant.
    """

    name: Optional[str] = None           # "Bright Smile Dental"
    industry: Optional[str] = None       # "dental clinic"
    offering: Optional[str] = None       # what they actually sell
    value_props: Optional[List[str]] = None
    pricing: Optional[str] = None        # only what they are happy to say aloud
    proof: Optional[str] = None          # clients, results, guarantees
    agent_name: Optional[str] = None     # the name the agent gives on the call
    cta: Optional[str] = None            # the specific next step to push for
    must_not_say: Optional[List[str]] = None
    extra: Optional[str] = None          # anything else, free text


class ChatRequest(BaseModel):
    conversation_history: List[Message]
    max_tokens: int = 150
    company: Optional[CompanyProfile] = None


class QualifyRequest(BaseModel):
    transcript: str


MAX_PROFILE_CHARS = 1200
MAX_REPLY_SENTENCES = int(os.getenv("LLM_MAX_SENTENCES", "2"))
# Generation is the expensive half of a turn, and clamp_sentences throws away
# anything past two sentences anyway — so generating the backend's default 150
# tokens just buys latency we then discard. Two sentences is ~40-60 tokens.
MAX_CHAT_TOKENS = int(os.getenv("LLM_MAX_CHAT_TOKENS", "80"))


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


MAX_PROFILE_CHARS = 1200


def build_system_prompt(company, base_prompt):
    # Guardrails first, then the tenant's facts. Order matters: the behavioural
    # rules read as the standing instruction, and the company block is framed as
    # the ONLY admissible source of facts, which is what has to stop the agent
    # inventing a price when a prospect pushes.
    if not company:
        return base_prompt

    facts = []
    if company.get("name"):
        facts.append("You work for " + str(company["name"]) + ".")
    if company.get("agent_name"):
        facts.append("Your name is " + str(company["agent_name"]) + ".")
    if company.get("industry"):
        facts.append("They are a " + str(company["industry"]) + ".")
    if company.get("offering"):
        facts.append("What they sell: " + str(company["offering"]))
    if company.get("value_props"):
        facts.append("Why customers choose them: " + "; ".join(company["value_props"]))
    if company.get("pricing"):
        facts.append("Pricing you MAY quote: " + str(company["pricing"]))
    if company.get("proof"):
        facts.append("Proof you may cite: " + str(company["proof"]))
    if company.get("cta"):
        facts.append("The outcome you are asking for: " + str(company["cta"]))
    if company.get("extra"):
        facts.append(str(company["extra"]))

    if not facts:
        return base_prompt

    block = "\n".join("- " + f for f in facts)[:MAX_PROFILE_CHARS]
    prompt = (
        base_prompt + "\n\n"
        + "THE COMPANY YOU REPRESENT. These are the ONLY facts you may state. "
        + "If you are asked anything not covered here - a price, a service, a "
        + "guarantee - do NOT guess: say you will check and follow up.\n"
        + block
    )
    if company.get("must_not_say"):
        prompt += "\n- Never mention: " + "; ".join(company["must_not_say"])
    return prompt


def company_to_dict(company) -> Optional[dict]:
    """CompanyProfile -> plain dict, across pydantic v1 and v2."""
    if company is None:
        return None
    if hasattr(company, "model_dump"):
        return company.model_dump(exclude_none=True)
    return company.dict(exclude_none=True)


def keyword_qualify(transcript: str):
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


@app.get("/health")
def health():
    return {"status": "ok", "llm_loaded": llm is not None,
            "mode": "production" if llm else "stub", "model": MODEL_FILE}


@app.post("/chat")
async def chat(request: ChatRequest):
    """Generate the next sales-agent turn from the conversation history."""
    if llm is not None:
        try:
            messages = [{"role": "system",
                         "content": build_system_prompt(
                             company_to_dict(request.company), SALES_SYSTEM_PROMPT)}]
            for msg in request.conversation_history[-6:]:
                messages.append({"role": msg.role, "content": msg.content})
            result = llm.create_chat_completion(
                messages=messages,
                max_tokens=min(request.max_tokens, MAX_CHAT_TOKENS),
                temperature=0.7, top_p=0.9)
            text = clamp_sentences(result["choices"][0]["message"]["content"].strip())
            if text:
                return {"response": text, "mode": "model"}
        except Exception as e:
            logger.error("LLM chat error: %s", e)
    return {"response": random.choice(SALES_RESPONSES), "mode": "stub"}


@app.post("/qualify")
async def qualify(request: QualifyRequest):
    """Classify a call transcript into the outcome enum the backend expects."""
    fallback = keyword_qualify(request.transcript)
    if llm is not None:
        try:
            result = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": QUALIFY_SYSTEM_PROMPT},
                    {"role": "user", "content": "Transcript:\n" + request.transcript[:1500]},
                ],
                max_tokens=120, temperature=0.1)
            raw = result["choices"][0]["message"]["content"]
            match = re.search(r"\{.*?\}", raw, re.S)
            data = json.loads(match.group(0))
            if data.get("outcome") in OUTCOMES:
                score = int(max(0, min(100, float(data.get("score", fallback["score"])))))
                notes = str(data.get("notes", ""))[:200] or "model qualification"
                return {"outcome": data["outcome"], "score": score,
                        "notes": notes, "mode": "model"}
            logger.warning("Model returned unknown outcome: %s", data.get("outcome"))
        except Exception as e:
            logger.warning("LLM qualify error: %s", e)
    return {**fallback, "notes": "keyword-based qualification", "mode": "stub"}
