"""Use-case logic behind the routes (no FastAPI imports): search, opportunities, batch analysis."""
import logging
from typing import Optional

from app.classification import analyze_sentiment, classify_business_category
from app.config import (
    ANALYZE_MAX_TEXTS,
    GOOGLE_API_KEY,
    OPPORTUNITY_MAX_RATING,
    OPPORTUNITY_MIN_RATING,
    SNIPPET_MAX_CHARS,
)
from app.places import generate_stub_businesses, search_google_places
from app.reference_data import REGIONS
from app.schemas import AnalyzeRequest, SearchRequest

logger = logging.getLogger(__name__)


def resolve_region(request: SearchRequest) -> Optional[dict]:
    """Return the REGIONS preset named by ``region_code`` (preferred) or ``location``, if any."""
    if request.region_code and request.region_code in REGIONS:
        return REGIONS[request.region_code]
    if request.location in REGIONS:
        return REGIONS[request.location]
    return None


async def search_businesses(request: SearchRequest) -> dict:
    """
    Search businesses via Google Places, falling back to stub data when no API
    key is configured, the upstream call fails, or it returns nothing.
    """
    region_info = resolve_region(request)
    location_str = region_info["location"] if region_info else request.location

    businesses = []

    if GOOGLE_API_KEY:
        try:
            businesses = await search_google_places(
                location_str=location_str,
                category=request.category,
                radius=request.radius_meters,
                lat=region_info["lat"] if region_info else None,
                lng=region_info["lng"] if region_info else None,
                max_results=request.max_results,
                min_rating=request.min_rating,
                max_rating=request.max_rating,
            )
        except Exception as e:
            logger.error("Google Places error: %s", e)
    else:
        logger.warning("No Google API key — returning stub data")

    if not businesses:
        businesses = generate_stub_businesses(location_str, request.category, request.max_results)

    return {
        "businesses": businesses,
        "location": location_str,
        "category": request.category,
        "region_code": request.region_code,
        "total": len(businesses),
    }


async def find_opportunities(request: SearchRequest) -> dict:
    """Search for poorly-rated businesses, worst first, with an outreach script for each."""
    request.max_rating = request.max_rating or OPPORTUNITY_MAX_RATING
    request.min_rating = request.min_rating or OPPORTUNITY_MIN_RATING
    result = await search_businesses(request)

    # Sort by rating ascending (worst first = best opportunities)
    result["businesses"].sort(key=lambda x: (x.get("rating") or 5))

    # Add outreach suggestion for each
    for biz in result["businesses"]:
        phone = biz.get("phone") or biz.get("phone_intl") or "No phone available"
        biz["outreach_script"] = (
            f"Hi, I'm calling for {biz['name']}. I noticed your business has "
            f"{biz['review_count']} reviews with an average of {biz['rating']} stars. "
            f"I help businesses like yours improve their online reputation and "
            f"attract more customers. Can I take 2 minutes to show you how?"
        )
        biz["contact_info"] = {
            "phone": phone,
            "website": biz.get("website", ""),
            "can_call": bool(biz.get("phone") or biz.get("phone_intl")),
        }

    return result


def analyze_texts(request: AnalyzeRequest) -> dict:
    """Sentiment (+ optional category) for up to ANALYZE_MAX_TEXTS text snippets."""
    results = []
    for text in request.texts[:ANALYZE_MAX_TEXTS]:
        sentiment, score, opportunity = analyze_sentiment(text, None)
        category = ""
        if request.include_category:
            category = classify_business_category("", [], text)
        results.append({
            "text":        text[:SNIPPET_MAX_CHARS],
            "sentiment":   sentiment,
            "score":       score,
            "category":    category,
            "opportunity": opportunity,
        })
    return {"results": results, "total": len(results)}
