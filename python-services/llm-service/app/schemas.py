"""Pydantic request models for the LLM routes."""
from typing import List, Optional

from pydantic import BaseModel


class Message(BaseModel):
    """One conversation turn."""

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
    """Body of ``POST /chat``."""

    conversation_history: List[Message]
    max_tokens: int = 150
    company: Optional[CompanyProfile] = None


class QualifyRequest(BaseModel):
    """Body of ``POST /qualify``."""

    transcript: str
