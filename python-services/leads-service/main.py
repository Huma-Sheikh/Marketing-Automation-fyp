import os
import json
import random
import logging
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Leads + NER + Scoring Service")

MODELS_DIR = "models"
ner_model = None
scorer_model = None

def load_models():
    global ner_model, scorer_model
    ner_path = os.path.join(MODELS_DIR, "ner_bert")
    scorer_path = os.path.join(MODELS_DIR, "lead_scorer.json")

    if os.path.exists(ner_path):
        try:
            from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
            tokenizer = AutoTokenizer.from_pretrained(ner_path)
            model = AutoModelForTokenClassification.from_pretrained(ner_path)
            ner_model = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")
            logger.info("NER model loaded")
        except Exception as e:
            logger.warning(f"NER model load failed: {e}")
    else:
        logger.info("NER model not found - stub mode")

    if os.path.exists(scorer_path):
        try:
            import xgboost as xgb
            scorer_model = xgb.Booster()
            scorer_model.load_model(scorer_path)
            logger.info("Lead scorer loaded")
        except Exception as e:
            logger.warning(f"Scorer load failed: {e}")
    else:
        logger.info("Lead scorer not found - stub mode")

load_models()

@app.get("/health")
def health():
    return {"status": "ok", "ner_loaded": ner_model is not None, "scorer_loaded": scorer_model is not None}

# ── DEMO LEADS (used in stub mode) ───────────────────────────────────────────
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
    platform_score: float = 3
    job_score: float = 3
    has_email: int = 1
    has_phone: int = 1
    has_website: int = 0
    company_size_score: float = 3
    engagement: float = 50
    industry_score: float = 3

class ExtractRequest(BaseModel):
    text: str

@app.post("/scrape")
async def scrape_leads(request: ScrapeRequest):
    """
    Scrape leads from social platform.
    STUB: Returns demo leads. Replace with real scraping logic after training NER.
    """
    count = min(request.max_results, 20)
    leads = []
    for i in range(count):
        base = DEMO_LEADS[i % len(DEMO_LEADS)].copy()
        base["id"] = f"stub_{i}_{request.platform}"
        base["sourceQuery"] = request.query
        leads.append(base)

    logger.info(f"Scrape stub: {request.platform} | {request.query} | returned {len(leads)}")
    return {"leads": leads, "platform": request.platform, "query": request.query}

@app.post("/score")
async def score_lead(request: ScoreRequest):
    """
    Score a lead using XGBoost model.
    STUB: Uses weighted formula until model is trained.
    """
    if scorer_model is not None:
        try:
            import xgboost as xgb
            import numpy as np
            features = [[request.platform_score, request.job_score, request.has_email,
                         request.has_phone, request.has_website, request.company_size_score,
                         request.engagement / 100, request.industry_score]]
            dmat = xgb.DMatrix(np.array(features))
            prob = float(scorer_model.predict(dmat)[0])
            score = round(prob * 100, 1)
            return {"score": score, "mode": "model"}
        except Exception as e:
            logger.warning(f"Scorer error: {e}")

    # Stub scoring formula
    score = (
        request.platform_score * 8 +
        request.job_score * 10 +
        request.has_email * 15 +
        request.has_phone * 12 +
        request.has_website * 5 +
        request.company_size_score * 5 +
        (request.engagement / 100) * 20 +
        request.industry_score * 5
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
