"""HTTP routes for the business service (thin handlers over ``app.business``)."""
from fastapi import APIRouter

from app import business, models
from app.config import GOOGLE_API_KEY
from app.reference_data import REGIONS
from app.schemas import AnalyzeRequest, SearchRequest

router = APIRouter()


@router.get("/health")
def health():
    """Report model status, Google API availability, regions and categories."""
    return {
        "status": "ok",
        "sentiment_loaded":        models.sentiment_model is not None,
        "category_model_loaded":   models.category_model is not None,
        "google_api":              bool(GOOGLE_API_KEY),
        "available_regions":       list(REGIONS.keys()),
        "business_categories":     list(models.business_categories.values()),
    }


@router.get("/regions")
def list_regions():
    """Return all available region codes and their labels."""
    return {
        "regions": [
            {"code": code, "label": info["label"]}
            for code, info in REGIONS.items()
        ]
    }


@router.post("/search")
async def search_businesses(request: SearchRequest):
    """
    Search businesses using Google Places API.
    Returns phone numbers, ratings, reviews, website, and sentiment analysis.
    Supports region codes for precise geographic targeting.
    """
    return await business.search_businesses(request)


@router.post("/find-opportunities")
async def find_opportunity_businesses(request: SearchRequest):
    """
    Specialized search: find businesses with poor reviews.
    These are prime targets for SEO and reputation management services.
    """
    return await business.find_opportunities(request)


@router.post("/analyze")
async def analyze_texts(request: AnalyzeRequest):
    """
    Batch analyze text snippets from scraped social media data.
    Returns sentiment + business category for each input text.

    Use this to post-process leads collected by colab_01_data_collection.py.

    Request body:
      {
        "texts": ["Amazing product, highly recommend!", "Worst service ever."],
        "include_category": true
      }

    Response:
      {
        "results": [
          {"text": "...", "sentiment": "POSITIVE", "score": 0.97,
           "category": "Professional Services", "opportunity": "..."},
          ...
        ],
        "total": 2
      }
    """
    return business.analyze_texts(request)
