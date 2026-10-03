import os
import json
import random
import logging
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict
from typing import Optional

import scrapers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Leads + NER + Scoring Service")

NER_MODEL_PATH = os.path.join("model", "distilbert_ner_prod_v2")
SCORER_PATH = os.path.join("model", "scorer", "xgboost_scorer.joblib")
ner_model = None
scorer_model = None

def load_models():
    global ner_model, scorer_model

    if os.path.exists(NER_MODEL_PATH):
        try:
            from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
            tokenizer = AutoTokenizer.from_pretrained(NER_MODEL_PATH)
            model = AutoModelForTokenClassification.from_pretrained(NER_MODEL_PATH)
            ner_model = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")
            logger.info("NER model loaded")
        except Exception as e:
            logger.warning(f"NER model load failed: {e}")
    else:
        logger.info("NER model not found - stub mode")

    if os.path.exists(SCORER_PATH):
        try:
            import joblib
            scorer_model = joblib.load(SCORER_PATH)
            logger.info("Lead scorer loaded (XGBRegressor via joblib)")
        except Exception as e:
            logger.warning(f"Scorer load failed: {e}")
    else:
        logger.info("Lead scorer not found - stub mode")

load_models()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "ner_loaded": ner_model is not None,
        "scorer_loaded": scorer_model is not None,
        "scrape_mode": scrapers.SCRAPE_MODE,
        "supported_platforms": scrapers.SUPPORTED_PLATFORMS,
    }

# ── DEMO LEADS (fallback when live scraping is off or yields nothing) ────────
DEMO_LEADS = [
    {"firstName": "Ahmed", "lastName": "Al-Rashid", "email": "ahmed@techcorp.ae", "phone": "+971501234567", "company": "TechCorp Dubai", "jobTitle": "CEO", "location": "Dubai, UAE", "website": "techcorp.ae", "engagement": 75},
    {"firstName": "Sarah", "lastName": "Johnson", "email": "sarah@growthco.com", "phone": "+12125551234", "company": "GrowthCo", "jobTitle": "Marketing Director", "location": "New York, USA", "website": "growthco.com", "engagement": 60},
    {"firstName": "Mohammed", "lastName": "Khan", "email": "m.khan@startup.pk", "phone": "+923001234567", "company": "StartupPK", "jobTitle": "Founder", "location": "Karachi, Pakistan", "website": "startup.pk", "engagement": 85},
    {"firstName": "Emma", "lastName": "Mueller", "email": "emma@digital.de", "phone": "+4915112345678", "company": "Digital GmbH", "jobTitle": "VP Sales", "location": "Berlin, Germany", "website": "digital.de", "engagement": 55},
    {"firstName": "Carlos", "lastName": "Rossi", "email": "carlos@media.fr", "phone": "+33612345678", "company": "Media France", "jobTitle": "Manager", "location": "Paris, France", "website": "media.fr", "engagement": 45},
]

class ScrapeRequest(BaseModel):
    platform: str
    query: str
    max_results: int = 100

class ScoreRequest(BaseModel):
    # extra="forbid" is deliberate. These field names are a contract with
    # nestjs-backend AiService.scoreLead() and with feature_names in
    # model/scorer/training_summary.json. Without it a renamed field is silently
    # swapped for its default and every lead comes back with the same score.
    model_config = ConfigDict(extra="forbid")

    platform_origin: float = 3        # e.g. LinkedIn=5, Twitter=3, Facebook=2
    job_title_seniority: float = 3    # e.g. CEO=5, Manager=3, Employee=1
    has_email: int = 1
    has_phone: int = 1
    company_size_indicator: float = 3 # 1=solo, 3=SME, 5=enterprise
    engagement_estimate: float = 50   # 0–100
    industry_signal: float = 3        # 1=low-value, 5=high-value industry
    bio_completeness: float = 0.5     # 0.0–1.0

class ExtractRequest(BaseModel):
    text: str

@app.post("/scrape")
async def scrape_leads(request: ScrapeRequest):
    """
    Scrape public profiles for leads.

    Real scraping runs only when SCRAPE_MODE=live (see scrapers.py); otherwise,
    and whenever a live scrape returns nothing, we fall back to the labelled demo
    dataset so the rest of the pipeline stays exercisable offline. The response
    always says which happened in `mode`, so the UI never shows demo rows as if
    they were real.
    """
    count = min(request.max_results, 50)
    leads: list = []
    mode = "demo"

    if scrapers.is_live():
        scraped = scrapers.scrape(request.platform, request.query, count)
        if scraped:
            leads = [enrich_lead(lead.to_dict()) for lead in scraped]
            mode = "live"
        else:
            logger.warning(
                f"Live scrape of {request.platform} returned nothing - falling back to demo data"
            )

    if not leads:
        for i in range(min(count, 20)):
            base = DEMO_LEADS[i % len(DEMO_LEADS)].copy()
            base["id"] = f"demo_{i}_{request.platform}"
            base["sourceQuery"] = request.query
            base["isDemoData"] = True
            leads.append(base)

    logger.info(f"Scrape ({mode}): {request.platform} | {request.query} | {len(leads)} leads")
    return {
        "leads": leads,
        "platform": request.platform,
        "query": request.query,
        "mode": mode,
        "supported_platforms": scrapers.SUPPORTED_PLATFORMS,
    }


def enrich_lead(lead: dict) -> dict:
    """
    Fill gaps in a scraped profile using the fine-tuned NER model.

    The NER checkpoint was being loaded at startup and then never called. Bios
    are the one place a scrape reliably yields an employer or a city that the
    structured fields miss, so that is where it earns its keep.
    """
    bio = lead.get("bio") or ""
    if not ner_model or not bio.strip():
        return lead

    try:
        entities = ner_model(bio[:512])
    except Exception as e:
        logger.warning(f"NER enrichment failed: {e}")
        return lead

    for ent in entities:
        group = (ent.get("entity_group") or ent.get("entity") or "").upper().lstrip("BI-")
        word = (ent.get("word") or "").strip()
        if not word or ent.get("score", 0) < 0.80:
            continue
        if group.startswith("ORG") and not lead.get("company"):
            lead["company"] = word
        elif group.startswith("LOC") and not lead.get("location"):
            lead["location"] = word
        elif group.startswith("PER") and not lead.get("firstName"):
            first, last = scrapers.split_name(word)
            lead["firstName"], lead["lastName"] = first, last

    return lead


@app.post("/score")
async def score_lead(request: ScoreRequest):
    """
    Score a lead using XGBoost model.
    STUB: Uses weighted formula until model is trained.
    """
    if scorer_model is not None:
        try:
            import numpy as np
            features = np.array([[
                request.platform_origin,
                request.job_title_seniority,
                request.has_email,
                request.has_phone,
                request.company_size_indicator,
                request.engagement_estimate,
                request.industry_signal,
                request.bio_completeness,
            ]])
            score = float(scorer_model.predict(features)[0])
            score = max(0, min(100, round(score, 1)))
            return {"score": score, "mode": "model"}
        except Exception as e:
            logger.warning(f"Scorer error: {e}")

    # Stub scoring formula (mirrors trained feature weights)
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
    score = max(0, min(100, round(score, 1)))
    return {"score": score, "mode": "stub"}

@app.post("/extract")
async def extract_entities(request: ExtractRequest):
    """Extract named entities from text using BERT NER model."""
    if ner_model is None:
        return {"entities": [], "mode": "stub"}
    try:
        results = ner_model(request.text)
        return {"entities": results, "mode": "model"}
    except Exception as e:
        logger.error(f"NER error: {e}")
        return {"entities": [], "error": str(e)}
