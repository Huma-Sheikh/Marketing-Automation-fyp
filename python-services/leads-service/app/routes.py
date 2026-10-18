"""HTTP routes for the leads service (thin handlers over ``app.leads`` / ``app.scrapers``)."""
import logging

from fastapi import APIRouter

from app import leads as lead_service
from app import models, scrapers
from app.config import MAX_SCRAPE_RESULTS
from app.leads import build_demo_leads, enrich_lead, model_score, stub_score
from app.schemas import ExtractRequest, ScoreRequest, ScrapeRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health():
    """Report model status, scrape mode and supported platforms."""
    return {
        "status": "ok",
        "ner_loaded": models.ner_model is not None,
        "scorer_loaded": models.scorer_model is not None,
        "scrape_mode": scrapers.SCRAPE_MODE,
        "supported_platforms": scrapers.SUPPORTED_PLATFORMS,
    }


@router.post("/scrape")
async def scrape_leads(request: ScrapeRequest):
    """
    Scrape public profiles for leads.

    Real scraping runs only when SCRAPE_MODE=live (see app/scrapers.py); otherwise,
    and whenever a live scrape returns nothing, we fall back to the labelled demo
    dataset so the rest of the pipeline stays exercisable offline. The response
    always says which happened in `mode`, so the UI never shows demo rows as if
    they were real.
    """
    count = min(request.max_results, MAX_SCRAPE_RESULTS)
    leads: list = []
    mode = "demo"

    if scrapers.is_live():
        scraped = scrapers.scrape(request.platform, request.query, count)
        if scraped:
            leads = [enrich_lead(lead.to_dict()) for lead in scraped]
            mode = "live"
        else:
            logger.warning("Live scrape of %s returned nothing - falling back to demo data", request.platform)

    if not leads:
        leads = build_demo_leads(request.platform, request.query, count)

    logger.info("Scrape (%s): %s | %s | %d leads", mode, request.platform, request.query, len(leads))
    return {
        "leads": leads,
        "platform": request.platform,
        "query": request.query,
        "mode": mode,
        "supported_platforms": scrapers.SUPPORTED_PLATFORMS,
    }


@router.post("/score")
async def score_lead(request: ScoreRequest):
    """Score a lead 0-100 with the XGBoost model, or the weighted stub formula if unavailable."""
    score = model_score(request)
    if score is not None:
        return {"score": score, "mode": "model"}
    return {"score": stub_score(request), "mode": "stub"}


@router.post("/extract")
async def extract_entities(request: ExtractRequest):
    """Extract named entities from text using the fine-tuned NER model."""
    if models.ner_model is None:
        return {"entities": [], "mode": "stub"}
    try:
        return {"entities": lead_service.extract_entities(request.text), "mode": "model"}
    except Exception as e:
        logger.error("NER error: %s", e)
        return {"entities": [], "error": str(e)}
