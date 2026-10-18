"""Prompt text, scripted fallback replies and the tenant-aware system-prompt builder."""
from typing import List, Optional

from app.config import MAX_PROFILE_CHARS
from app.schemas import CompanyProfile

SALES_SYSTEM_PROMPT = "You are a professional AI sales agent for an AI marketing automation platform. Be warm, natural and concise. Reply in at most 2 short sentences, then ask one qualifying question. Never be pushy, never invent pricing, and always respect a clear no."

QUALIFY_SYSTEM_PROMPT = "You analyse sales call transcripts. Reply with ONE line of strict JSON and nothing else: {\"outcome\": \"qualified|not-interested|callback|voicemail|contacted\", \"score\": 0-100, \"notes\": \"brief reason\"}"

# Outcome enum the backend expects from /qualify.
OUTCOMES: List[str] = ["qualified", "not-interested", "callback", "voicemail", "contacted"]

# Scripted replies used in stub mode or when generation fails.
SALES_RESPONSES: List[str] = [
    "That is great to hear! We help businesses like yours generate more leads through AI-powered outreach. Would you be open to a quick demo this week?",
    "I completely understand. What if we could show you results within the first 30 days?",
    "Absolutely. What is your biggest challenge with lead generation right now?",
    "That makes sense. Our platform automates outreach so your team can focus on closing. Can I send you some case studies?",
    "Perfect timing. Would Thursday or Friday work better for a 15-minute call?",
]


def build_system_prompt(company: Optional[dict], base_prompt: str) -> str:
    """Append the tenant's facts (if any) to ``base_prompt`` as the only admissible facts."""
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


def company_to_dict(company: Optional[CompanyProfile]) -> Optional[dict]:
    """CompanyProfile -> plain dict, across pydantic v1 and v2."""
    if company is None:
        return None
    if hasattr(company, "model_dump"):
        return company.model_dump(exclude_none=True)
    return company.dict(exclude_none=True)
