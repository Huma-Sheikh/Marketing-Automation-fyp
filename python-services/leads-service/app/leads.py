"""Lead business logic (no FastAPI imports): demo data, NER enrichment, scoring, extraction."""
import logging
from typing import Any, Dict, List, Optional

from app import models, scrapers
from app.config import MAX_DEMO_LEADS, NER_MAX_CHARS, NER_MIN_SCORE, SCORER_FEATURES
from app.schemas import ScoreRequest

logger = logging.getLogger(__name__)

# ── DEMO LEADS (fallback when live scraping is off or yields nothing) ────────
DEMO_LEADS: List[Dict[str, Any]] = [
    {"firstName": "Ahmed", "lastName": "Al-Rashid", "email": "ahmed@techcorp.ae", "phone": "+971501234567", "company": "TechCorp Dubai", "jobTitle": "CEO", "location": "Dubai, UAE", "website": "techcorp.ae", "engagement": 75},
    {"firstName": "Sarah", "lastName": "Johnson", "email": "sarah@growthco.com", "phone": "+12125551234", "company": "GrowthCo", "jobTitle": "Marketing Director", "location": "New York, USA", "website": "growthco.com", "engagement": 60},
    {"firstName": "Mohammed", "lastName": "Khan", "email": "m.khan@startup.pk", "phone": "+923001234567", "company": "StartupPK", "jobTitle": "Founder", "location": "Karachi, Pakistan", "website": "startup.pk", "engagement": 85},
    {"firstName": "Emma", "lastName": "Mueller", "email": "emma@digital.de", "phone": "+4915112345678", "company": "Digital GmbH", "jobTitle": "VP Sales", "location": "Berlin, Germany", "website": "digital.de", "engagement": 55},
    {"firstName": "Carlos", "lastName": "Rossi", "email": "carlos@media.fr", "phone": "+33612345678", "company": "Media France", "jobTitle": "Manager", "location": "Paris, France", "website": "media.fr", "engagement": 45},
]


def build_demo_leads(platform: str, query: str, count: int) -> List[Dict[str, Any]]:
    """Return up to ``MAX_DEMO_LEADS`` labelled demo leads (``isDemoData: True``)."""
    leads = []
    for i in range(min(count, MAX_DEMO_LEADS)):
        lead = DEMO_LEADS[i % len(DEMO_LEADS)].copy()
        lead["id"] = f"demo_{i}_{platform}"
        lead["sourceQuery"] = query
        lead["isDemoData"] = True
        leads.append(lead)
    return leads


def enrich_lead(lead: dict) -> dict:
    """
    Fill gaps in a scraped profile using the fine-tuned NER model.

    The NER checkpoint was being loaded at startup and then never called. Bios
    are the one place a scrape reliably yields an employer or a city that the
    structured fields miss, so that is where it earns its keep.
    """
    bio = lead.get("bio") or ""
    if not models.ner_model or not bio.strip():
        return lead

    try:
        entities = models.ner_model(bio[:NER_MAX_CHARS])
    except Exception as e:
        logger.warning("NER enrichment failed: %s", e)
        return lead

    for ent in entities:
        group = (ent.get("entity_group") or ent.get("entity") or "").upper().lstrip("BI-")
        word = (ent.get("word") or "").strip()
        if not word or ent.get("score", 0) < NER_MIN_SCORE:
            continue
        if group.startswith("ORG") and not lead.get("company"):
            lead["company"] = word
        elif group.startswith("LOC") and not lead.get("location"):
            lead["location"] = word
        elif group.startswith("PER") and not lead.get("firstName"):
            first, last = scrapers.split_name(word)
            lead["firstName"], lead["lastName"] = first, last

    return lead


def _clamp_score(score: float) -> float:
    """Round to one decimal and clamp into the 0-100 range."""
    return max(0, min(100, round(score, 1)))


def model_score(request: ScoreRequest) -> Optional[float]:
    """Score with the XGBoost model; returns None if it is not loaded or prediction fails."""
    if models.scorer_model is None:
        return None
    try:
        import numpy as np
        features = np.array([[getattr(request, name) for name in SCORER_FEATURES]])
        return _clamp_score(float(models.scorer_model.predict(features)[0]))
    except Exception as e:
        logger.warning("Scorer error: %s", e)
        return None


def stub_score(request: ScoreRequest) -> float:
    """Weighted-formula score used when the model is unavailable (mirrors trained feature weights)."""
    score = (
        request.platform_origin * 8 +
        request.job_title_seniority * 10 +
        request.has_email * 15 +
        request.has_phone * 12 +
        request.company_size_indicator * 5 +
        (request.engagement_estimate / 100) * 20 +
        request.industry_signal * 5 +
        request.bio_completeness * 5
    )
    return _clamp_score(score)


def _to_native(value: Any) -> Any:
    """Convert numpy scalars (e.g. the pipeline's float32 ``score``) to plain Python types."""
    if type(value).__module__ == "numpy" and hasattr(value, "item"):
        return value.item()
    return value


def extract_entities(text: str) -> List[Dict[str, Any]]:
    """Run the NER pipeline over ``text`` and return JSON-serialisable entity dicts.

    The HF pipeline returns numpy float32 scores, which FastAPI cannot encode;
    they used to turn every non-empty /extract response into a bare 500.
    """
    results = models.ner_model(text)
    return [{k: _to_native(v) for k, v in ent.items()} for ent in results]
