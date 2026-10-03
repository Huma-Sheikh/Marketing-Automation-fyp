import os
import json
import logging
import requests
from fastapi import FastAPI, Query
from pydantic import BaseModel
from typing import Optional, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Business Scraper + Sentiment Service")

# The trained checkpoints live in model/ (singular) — see README. Overridable
# so the Docker image and a local checkout can point at different locations.
MODELS_DIR = os.getenv("MODELS_DIR", "model")
GOOGLE_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
sentiment_model  = None   # RoBERTa fine-tuned on Yelp+Amazon+Twitter
category_model   = None   # DistilBERT fine-tuned on 10 business categories
# Below this softmax score we prefer the Google Places `types` mapping over the
# classifier — see _classify_business_category().
CATEGORY_MIN_CONFIDENCE = float(os.getenv("CATEGORY_MIN_CONFIDENCE", "0.75"))

BUSINESS_CATEGORIES = {
    0: "Food & Beverage",
    1: "Retail & Shopping",
    2: "Healthcare & Wellness",
    3: "Technology & Software",
    4: "Finance & Banking",
    5: "Real Estate & Property",
    6: "Entertainment & Media",
    7: "Professional Services",
    8: "Education & Training",
    9: "Automotive & Transport",
}

# ── Region presets ─────────────────────────────────────────
# Maps short region codes to full location strings for Places API
REGIONS = {
    # Middle East
    "ae-dubai":     {"label": "Dubai, UAE",        "location": "Dubai, United Arab Emirates",    "lat": 25.2048, "lng": 55.2708, "radius": 30000},
    "ae-abu-dhabi": {"label": "Abu Dhabi, UAE",     "location": "Abu Dhabi, United Arab Emirates","lat": 24.4539, "lng": 54.3773, "radius": 30000},
    "ae-sharjah":   {"label": "Sharjah, UAE",       "location": "Sharjah, United Arab Emirates",  "lat": 25.3462, "lng": 55.4210, "radius": 20000},
    "sa-riyadh":    {"label": "Riyadh, Saudi Arabia","location": "Riyadh, Saudi Arabia",          "lat": 24.7136, "lng": 46.6753, "radius": 40000},
    "sa-jeddah":    {"label": "Jeddah, Saudi Arabia","location": "Jeddah, Saudi Arabia",          "lat": 21.5433, "lng": 39.1728, "radius": 30000},
    "kw-kuwait":    {"label": "Kuwait City, Kuwait", "location": "Kuwait City, Kuwait",            "lat": 29.3759, "lng": 47.9774, "radius": 25000},
    "qa-doha":      {"label": "Doha, Qatar",         "location": "Doha, Qatar",                   "lat": 25.2854, "lng": 51.5310, "radius": 20000},
    "bh-manama":    {"label": "Manama, Bahrain",     "location": "Manama, Bahrain",               "lat": 26.2235, "lng": 50.5876, "radius": 15000},
    "om-muscat":    {"label": "Muscat, Oman",        "location": "Muscat, Oman",                  "lat": 23.5880, "lng": 58.3829, "radius": 25000},
    # South Asia
    "pk-karachi":   {"label": "Karachi, Pakistan",   "location": "Karachi, Pakistan",             "lat": 24.8607, "lng": 67.0011, "radius": 40000},
    "pk-lahore":    {"label": "Lahore, Pakistan",    "location": "Lahore, Pakistan",              "lat": 31.5204, "lng": 74.3587, "radius": 30000},
    "pk-islamabad": {"label": "Islamabad, Pakistan", "location": "Islamabad, Pakistan",           "lat": 33.6844, "lng": 73.0479, "radius": 20000},
    "in-mumbai":    {"label": "Mumbai, India",       "location": "Mumbai, India",                 "lat": 19.0760, "lng": 72.8777, "radius": 40000},
    "in-delhi":     {"label": "Delhi, India",        "location": "New Delhi, India",              "lat": 28.6139, "lng": 77.2090, "radius": 40000},
    # Europe
    "gb-london":    {"label": "London, UK",          "location": "London, United Kingdom",        "lat": 51.5074, "lng": -0.1278, "radius": 30000},
    "de-berlin":    {"label": "Berlin, Germany",     "location": "Berlin, Germany",               "lat": 52.5200, "lng": 13.4050, "radius": 30000},
    "fr-paris":     {"label": "Paris, France",       "location": "Paris, France",                 "lat": 48.8566, "lng": 2.3522,  "radius": 25000},
    # North America
    "us-nyc":       {"label": "New York, USA",       "location": "New York City, USA",            "lat": 40.7128, "lng": -74.0060,"radius": 30000},
    "us-la":        {"label": "Los Angeles, USA",    "location": "Los Angeles, USA",              "lat": 34.0522, "lng": -118.2437,"radius":40000},
    "ca-toronto":   {"label": "Toronto, Canada",     "location": "Toronto, Canada",               "lat": 43.6532, "lng": -79.3832, "radius":30000},
}

def load_models():
    global sentiment_model, category_model

    # ── Sentiment model (trained by colab_02_sentiment_training.py) ──
    sentiment_path = os.path.join(MODELS_DIR, "sentiment_roberta")
    if os.path.exists(sentiment_path):
        try:
            from transformers import pipeline
            sentiment_model = pipeline(
                "text-classification",
                model=sentiment_path,
                device=0 if _cuda_available() else -1,
            )
            logger.info("Sentiment model loaded (fine-tuned RoBERTa)")
        except Exception as e:
            logger.warning(f"Sentiment model load failed: {e}")
    else:
        logger.info("Sentiment model not found — using rating-based fallback")

    # ── Business category model (trained by colab_02_sentiment_training.py) ──
    category_path = os.path.join(MODELS_DIR, "business_category")
    if os.path.exists(category_path):
        try:
            from transformers import pipeline
            # Load category labels from saved config
            config_file = os.path.join(category_path, "training_info.json")
            if os.path.exists(config_file):
                with open(config_file) as f:
                    cfg = json.load(f)
                    global BUSINESS_CATEGORIES
                    BUSINESS_CATEGORIES = {int(k): v for k, v in cfg.get("categories", BUSINESS_CATEGORIES).items()}

            category_model = pipeline(
                "text-classification",
                model=category_path,
                device=0 if _cuda_available() else -1,
            )
            logger.info("Business category model loaded (fine-tuned DistilBERT)")
        except Exception as e:
            logger.warning(f"Category model load failed: {e}")
    else:
        logger.info("Category model not found — category field will be empty")


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


load_models()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "sentiment_loaded":        sentiment_model is not None,
        "category_model_loaded":   category_model  is not None,
        "google_api":              bool(GOOGLE_API_KEY),
        "available_regions":       list(REGIONS.keys()),
        "business_categories":     list(BUSINESS_CATEGORIES.values()),
    }

@app.get("/regions")
def list_regions():
    """Return all available region codes and their labels."""
    return {
        "regions": [
            {"code": code, "label": info["label"]}
            for code, info in REGIONS.items()
        ]
    }

class SearchRequest(BaseModel):
    location: str           # Free text OR region code e.g. "ae-dubai"
    category: str           # Business category e.g. "restaurant", "dentist"
    region_code: Optional[str] = None  # Optional: overrides location
    radius_meters: int = 25000         # Search radius in meters
    min_rating: Optional[float] = None # Filter by minimum rating
    max_rating: Optional[float] = None # Filter by maximum rating (find bad reviews)
    max_results: int = 20

@app.post("/search")
async def search_businesses(request: SearchRequest):
    """
    Search businesses using Google Places API.
    Returns phone numbers, ratings, reviews, website, and sentiment analysis.
    Supports region codes for precise geographic targeting.
    """
    # ── Resolve region ──────────────────────────────────────
    region_info = None
    if request.region_code and request.region_code in REGIONS:
        region_info = REGIONS[request.region_code]
    elif request.location in REGIONS:
        region_info = REGIONS[request.location]

    location_str = region_info["location"] if region_info else request.location
    radius = request.radius_meters

    businesses = []

    if GOOGLE_API_KEY:
        try:
            businesses = await _search_google_places(
                location_str=location_str,
                category=request.category,
                radius=radius,
                lat=region_info["lat"] if region_info else None,
                lng=region_info["lng"] if region_info else None,
                max_results=request.max_results,
                min_rating=request.min_rating,
                max_rating=request.max_rating,
            )
        except Exception as e:
            logger.error(f"Google Places error: {e}")
    else:
        logger.warning("No Google API key — returning stub data")

    if not businesses:
        businesses = _generate_stub_businesses(
            location_str, request.category, request.max_results
        )

    return {
        "businesses": businesses,
        "location": location_str,
        "category": request.category,
        "region_code": request.region_code,
        "total": len(businesses),
    }

async def _search_google_places(
    location_str: str,
    category: str,
    radius: int,
    lat: Optional[float],
    lng: Optional[float],
    max_results: int,
    min_rating: Optional[float],
    max_rating: Optional[float],
) -> List[dict]:
    """
    Call Google Places API in two steps:
      1. Text Search → get place IDs
      2. Place Details → get phone, website, hours per place
    """
    businesses = []

    # ── Step 1: Text Search ──
    if lat and lng:
        # Use location bias for region-specific search
        search_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        search_params = {
            "location": f"{lat},{lng}",
            "radius": radius,
            "keyword": category,
            "key": GOOGLE_API_KEY,
        }
    else:
        search_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        search_params = {
            "query": f"{category} in {location_str}",
            "key": GOOGLE_API_KEY,
        }

    all_place_ids = []
    next_page_token = None

    # Fetch up to 3 pages (60 results max from Google)
    for page in range(3):
        params = dict(search_params)
        if next_page_token:
            params = {"pagetoken": next_page_token, "key": GOOGLE_API_KEY}

        resp = requests.get(search_url, params=params, timeout=10)
        data = resp.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            logger.warning(f"Places API status: {data.get('status')} — {data.get('error_message', '')}")
            break

        for place in data.get("results", []):
            rating = place.get("rating")
            # Apply rating filters
            if min_rating and rating and rating < min_rating:
                continue
            if max_rating and rating and rating > max_rating:
                continue
            all_place_ids.append({
                "place_id": place.get("place_id"),
                "name": place.get("name"),
                "rating": rating,
                "review_count": place.get("user_ratings_total"),
                "address": place.get("formatted_address") or place.get("vicinity"),
                "types": place.get("types", []),
            })

        next_page_token = data.get("next_page_token")
        if not next_page_token or len(all_place_ids) >= max_results:
            break

        import time; time.sleep(2)  # Required delay between paginated requests

    logger.info(f"Found {len(all_place_ids)} places via text search")

    # ── Step 2: Place Details — get phone + website + hours ──
    details_url = "https://maps.googleapis.com/maps/api/place/details/json"
    # Fields to fetch (each costs API credits — only fetch what you need)
    fields = "name,rating,user_ratings_total,formatted_address,formatted_phone_number,international_phone_number,website,opening_hours,business_status,url,reviews,geometry"

    for place_stub in all_place_ids[:max_results]:
        try:
            details_resp = requests.get(details_url, params={
                "place_id": place_stub["place_id"],
                "fields": fields,
                "key": GOOGLE_API_KEY,
            }, timeout=10)
            details = details_resp.json().get("result", {})

            # Extract all reviews text for sentiment
            reviews = details.get("reviews", [])
            review_texts = [r.get("text", "") for r in reviews[:5] if r.get("text")]
            combined_review_text = " ".join(review_texts)

            # Analyze sentiment
            sentiment, sentiment_score, opportunity = _analyze_sentiment(
                combined_review_text, details.get("rating")
            )

            biz_name  = details.get("name") or place_stub["name"]
            biz_types = place_stub["types"]

            # Build response object
            biz = {
                "name":              biz_name,
                "address":           details.get("formatted_address") or place_stub["address"],
                "phone":             details.get("formatted_phone_number", ""),
                "phone_intl":        details.get("international_phone_number", ""),
                "website":           details.get("website", ""),
                "rating":            details.get("rating") or place_stub["rating"],
                "review_count":      details.get("user_ratings_total") or place_stub["review_count"],
                "status":            details.get("business_status", "OPERATIONAL"),
                "google_maps_url":   details.get("url", ""),
                "is_open_now":       _is_open_now(details.get("opening_hours")),
                "opening_hours":     details.get("opening_hours", {}).get("weekday_text", []),
                "location": {
                    "lat": details.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": details.get("geometry", {}).get("location", {}).get("lng"),
                },
                "recent_reviews": [
                    {
                        "author":   r.get("author_name"),
                        "rating":   r.get("rating"),
                        "text":     r.get("text", "")[:200],
                        "time_ago": r.get("relative_time_description"),
                    }
                    for r in reviews[:3]
                ],
                "sentiment":         sentiment,
                "sentiment_score":   sentiment_score,
                "opportunity":       opportunity,
                "business_category": _classify_business_category(biz_name, biz_types, combined_review_text),
                "types":             biz_types,
                "place_id":          place_stub["place_id"],
            }

            businesses.append(biz)

        except Exception as e:
            logger.warning(f"Place details failed for {place_stub.get('name')}: {e}")
            # Add stub entry with basic info
            businesses.append({
                **place_stub,
                "phone": "",
                "phone_intl": "",
                "website": "",
                "sentiment": "NEUTRAL",
                "opportunity": "Could not fetch details",
            })

    return businesses

def _is_open_now(opening_hours: Optional[dict]) -> Optional[bool]:
    if not opening_hours:
        return None
    return opening_hours.get("open_now")

def _analyze_sentiment(review_text: str, rating: Optional[float]) -> tuple:
    """
    Analyze review sentiment. Uses trained RoBERTa model if available,
    otherwise falls back to rating-based logic.
    Returns (sentiment_label, confidence_score, opportunity_text)
    """
    if sentiment_model and review_text.strip():
        try:
            result = sentiment_model(review_text[:512])[0]
            raw_label = result["label"].upper()
            score = round(result["score"], 3)
        except Exception:
            raw_label, score = _rating_to_sentiment(rating)
    else:
        raw_label, score = _rating_to_sentiment(rating)

    # Normalise label regardless of model output format
    # Trained model outputs: NEGATIVE / NEUTRAL / POSITIVE
    # Legacy/untrained: LABEL_0 / LABEL_1 / LABEL_2
    if raw_label in ("LABEL_0", "0", "NEGATIVE"):
        label = "NEGATIVE"
    elif raw_label in ("LABEL_2", "2", "POSITIVE"):
        label = "POSITIVE"
    else:
        label = "NEUTRAL"

    opportunities = {
        "NEGATIVE": "⚠ Poor reviews — strong SEO/reputation management opportunity",
        "NEUTRAL":  "→ Average rating — digital marketing improvement opportunity",
        "POSITIVE": "✓ Good reputation — upsell premium marketing services",
    }
    return label, score, opportunities.get(label, "Marketing opportunity")


TYPE_CATEGORY_MAP = [
    (("restaurant", "food", "cafe", "bar", "bakery", "meal_"),        "Food & Beverage"),
    (("store", "shop", "retail", "clothing", "mall", "supermarket"),  "Retail & Shopping"),
    (("hospital", "doctor", "dentist", "gym", "pharmacy", "health",
      "physiotherapist", "spa", "veterinary"),                        "Healthcare & Wellness"),
    (("school", "university", "education", "training", "library"),    "Education & Training"),
    (("bank", "finance", "insurance", "accounting", "atm"),           "Finance & Banking"),
    (("real_estate", "property", "housing", "lodging"),               "Real Estate & Property"),
    (("car", "automotive", "vehicle", "gas_station", "parking"),      "Automotive & Transport"),
    (("movie", "night_club", "casino", "museum", "art_gallery"),      "Entertainment & Media"),
    (("electronics", "software", "computer"),                         "Technology & Software"),
]


def _category_from_types(types: list) -> Optional[str]:
    """
    Map Google Places `types` onto our category set.

    Returns None when the types are only generic markers like
    `point_of_interest`/`establishment`, which carry no category signal.
    """
    types_str = " ".join(types or []).lower()
    if not types_str:
        return None
    for keys, category in TYPE_CATEGORY_MAP:
        if any(k in types_str for k in keys):
            return category
    return None


def _classify_business_category(name: str, types: list, bio: str = "") -> str:
    """
    Classify a business into one of 10 categories.

    Order matters: Google's `types` field is ground truth supplied by the place
    itself, while the fine-tuned classifier is an inference from a short name.
    The classifier was previously consulted first and would confidently override
    `types` with a wrong answer - a dentist coming back as "Food & Beverage" -
    so it now only runs when `types` carries no usable signal (as in /analyze,
    which has text but no place data).
    """
    from_types = _category_from_types(types)
    if from_types:
        return from_types

    if category_model:
        text = f"{name}. {bio}"[:512].strip(". ").strip()
        if text:
            try:
                result = category_model(text)[0]
                if result.get("score", 0) >= CATEGORY_MIN_CONFIDENCE:
                    label = result["label"]
                    label_id = int(label.replace("LABEL_", "")) if label.startswith("LABEL_") else 0
                    return BUSINESS_CATEGORIES.get(label_id, "Professional Services")
            except Exception:
                pass

    return "Professional Services"


def _rating_to_sentiment(rating: Optional[float]) -> tuple:
    if rating is None:
        return "NEUTRAL", 0.5
    if rating < 3.0:
        return "NEGATIVE", round(1.0 - (rating / 5.0), 2)
    elif rating < 4.0:
        return "NEUTRAL", 0.5
    else:
        return "POSITIVE", round(rating / 5.0, 2)

def _generate_stub_businesses(location: str, category: str, count: int) -> List[dict]:
    """Return realistic stub data when Google API key is not set."""
    stubs = []
    phone_prefixes = [
        (("uae", "united arab emirates", "dubai", "abu dhabi", "sharjah"), "+971 50"),
        (("pakistan", "karachi", "lahore", "islamabad"),                   "+92 300"),
        (("saudi", "riyadh", "jeddah"),                                    "+966 50"),
        (("kuwait",),                                                      "+965 5"),
        (("qatar", "doha"),                                                "+974 3"),
        (("bahrain", "manama"),                                            "+973 3"),
        (("oman", "muscat"),                                               "+968 9"),
        (("india", "mumbai", "delhi"),                                     "+91 98"),
        (("uk", "united kingdom", "london"),                               "+44 20"),
        (("usa", "united states", "new york", "los angeles"),              "+1 212"),
        (("canada", "toronto"),                                            "+1 416"),
        (("germany", "berlin"),                                            "+49 30"),
        (("france", "paris"),                                              "+33 1"),
    ]
    loc = location.lower()
    prefix = "+1 555"
    for keys, ph in phone_prefixes:
        if any(k in loc for k in keys):
            prefix = ph
            break

    for i in range(min(count, 8)):
        rating = round(2.0 + (i * 0.4), 1)
        sentiment, score, opp = _analyze_sentiment("", rating)
        stubs.append({
            "name":            f"Demo {category.title()} Business {i+1}",
            "address":         f"{100 + i} Main St, {location}",
            "phone":           f"{prefix} {1000000 + i * 123456:07d}"[:15],
            "phone_intl":      f"{prefix} {1000000 + i * 123456:07d}"[:15],
            "website":         f"https://demo-business-{i+1}.example.com",
            "rating":          rating,
            "review_count":    50 + i * 30,
            "status":          "OPERATIONAL",
            "google_maps_url": "",
            "is_open_now":     True,
            "opening_hours":   ["Monday–Friday: 9:00 AM – 6:00 PM"],
            "location":        {"lat": 25.2 + i * 0.01, "lng": 55.27 + i * 0.01},
            "recent_reviews":  [],
            "sentiment":         sentiment,
            "sentiment_score":   score,
            "opportunity":       opp,
            "business_category": _classify_business_category(f"Demo {category.title()}", [category]),
            "types":             [category.lower().replace(" ", "_")],
            "place_id":          f"stub_{i}",
        })
    return stubs


# ── Convenience endpoint: find low-rated businesses ──────────
@app.post("/find-opportunities")
async def find_opportunity_businesses(request: SearchRequest):
    """
    Specialized search: find businesses with poor reviews.
    These are prime targets for SEO and reputation management services.
    """
    request.max_rating = request.max_rating or 3.5
    request.min_rating = request.min_rating or 1.0
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


# ── Batch sentiment + category analysis for scraped leads ────
class AnalyzeRequest(BaseModel):
    texts: List[str]    # List of review/bio/post texts to analyze
    include_category: bool = True


@app.post("/analyze")
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
        ]
      }
    """
    results = []
    for text in request.texts[:200]:  # Cap at 200 to avoid timeouts
        sentiment, score, opportunity = _analyze_sentiment(text, None)
        category = ""
        if request.include_category:
            category = _classify_business_category("", [], text)
        results.append({
            "text":        text[:200],
            "sentiment":   sentiment,
            "score":       score,
            "category":    category,
            "opportunity": opportunity,
        })
    return {"results": results, "total": len(results)}
