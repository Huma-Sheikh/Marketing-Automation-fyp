"""Pydantic request models for the leads routes."""
from pydantic import BaseModel, ConfigDict


class ScrapeRequest(BaseModel):
    """Body of ``POST /scrape``."""

    platform: str
    query: str
    max_results: int = 100


class ScoreRequest(BaseModel):
    """Body of ``POST /score``: the eight scorer features."""

    # extra="forbid" is deliberate. These field names are a contract with
    # nestjs-backend AiService.scoreLead() and with feature_names in
    # model/scorer/training_summary.json. Without it a renamed field is silently
    # swapped for its default and every lead comes back with the same score.
    model_config = ConfigDict(extra="forbid")

    platform_origin: float = 3        # e.g. LinkedIn=5, Twitter=3, Facebook=2
    job_title_seniority: float = 3    # e.g. CEO=5, Manager=3, Employee=1
    has_email: int = 1
    has_phone: int = 1
    company_size_indicator: float = 3  # 1=solo, 3=SME, 5=enterprise
    engagement_estimate: float = 50   # 0–100
    industry_signal: float = 3        # 1=low-value, 5=high-value industry
    bio_completeness: float = 0.5     # 0.0–1.0


class ExtractRequest(BaseModel):
    """Body of ``POST /extract``."""

    text: str
