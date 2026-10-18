"""Google Places client and the stub-business generator used when it is unavailable."""
import logging
import time
from typing import List, Optional

import requests

from app.classification import analyze_sentiment, classify_business_category
from app.config import (
    GOOGLE_API_KEY,
    MAX_STUB_BUSINESSES,
    PLACES_DETAILS_FIELDS,
    PLACES_DETAILS_URL,
    PLACES_HTTP_TIMEOUT,
    PLACES_MAX_PAGES,
    PLACES_NEARBY_URL,
    PLACES_PAGE_DELAY_SECONDS,
    PLACES_TEXT_SEARCH_URL,
    SNIPPET_MAX_CHARS,
)
from app.reference_data import DEFAULT_STUB_PHONE_PREFIX, STUB_PHONE_PREFIXES

logger = logging.getLogger(__name__)


def is_open_now(opening_hours: Optional[dict]) -> Optional[bool]:
    """Return Places' ``open_now`` flag, or None when hours are unknown."""
    if not opening_hours:
        return None
    return opening_hours.get("open_now")


async def search_google_places(
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

    Raises on transport errors from step 1 (the caller falls back to stub data);
    a failed details lookup for one place degrades that entry only.
    """
    businesses = []

    # ── Step 1: Text Search ──
    if lat and lng:
        # Use location bias for region-specific search
        search_url = PLACES_NEARBY_URL
        search_params = {
            "location": f"{lat},{lng}",
            "radius": radius,
            "keyword": category,
            "key": GOOGLE_API_KEY,
        }
    else:
        search_url = PLACES_TEXT_SEARCH_URL
        search_params = {
            "query": f"{category} in {location_str}",
            "key": GOOGLE_API_KEY,
        }

    all_place_ids = []
    next_page_token = None

    # Fetch up to 3 pages (60 results max from Google)
    for _ in range(PLACES_MAX_PAGES):
        params = dict(search_params)
        if next_page_token:
            params = {"pagetoken": next_page_token, "key": GOOGLE_API_KEY}

        resp = requests.get(search_url, params=params, timeout=PLACES_HTTP_TIMEOUT)
        data = resp.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            logger.warning("Places API status: %s — %s", data.get("status"), data.get("error_message", ""))
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

        time.sleep(PLACES_PAGE_DELAY_SECONDS)  # Required delay between paginated requests

    logger.info("Found %d places via text search", len(all_place_ids))

    # ── Step 2: Place Details — get phone + website + hours ──
    for place_stub in all_place_ids[:max_results]:
        try:
            details_resp = requests.get(PLACES_DETAILS_URL, params={
                "place_id": place_stub["place_id"],
                "fields": PLACES_DETAILS_FIELDS,
                "key": GOOGLE_API_KEY,
            }, timeout=PLACES_HTTP_TIMEOUT)
            details = details_resp.json().get("result", {})

            # Extract all reviews text for sentiment
            reviews = details.get("reviews", [])
            review_texts = [r.get("text", "") for r in reviews[:5] if r.get("text")]
            combined_review_text = " ".join(review_texts)

            # Analyze sentiment
            sentiment, sentiment_score, opportunity = analyze_sentiment(
                combined_review_text, details.get("rating")
            )

            biz_name = details.get("name") or place_stub["name"]
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
                "is_open_now":       is_open_now(details.get("opening_hours")),
                "opening_hours":     details.get("opening_hours", {}).get("weekday_text", []),
                "location": {
                    "lat": details.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": details.get("geometry", {}).get("location", {}).get("lng"),
                },
                "recent_reviews": [
                    {
                        "author":   r.get("author_name"),
                        "rating":   r.get("rating"),
                        "text":     r.get("text", "")[:SNIPPET_MAX_CHARS],
                        "time_ago": r.get("relative_time_description"),
                    }
                    for r in reviews[:3]
                ],
                "sentiment":         sentiment,
                "sentiment_score":   sentiment_score,
                "opportunity":       opportunity,
                "business_category": classify_business_category(biz_name, biz_types, combined_review_text),
                "types":             biz_types,
                "place_id":          place_stub["place_id"],
            }

            businesses.append(biz)

        except Exception as e:
            logger.warning("Place details failed for %s: %s", place_stub.get("name"), e)
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


def generate_stub_businesses(location: str, category: str, count: int) -> List[dict]:
    """Return realistic stub data when Google API key is not set."""
    stubs = []
    loc = location.lower()
    prefix = DEFAULT_STUB_PHONE_PREFIX
    for keys, ph in STUB_PHONE_PREFIXES:
        if any(k in loc for k in keys):
            prefix = ph
            break

    for i in range(min(count, MAX_STUB_BUSINESSES)):
        rating = round(2.0 + (i * 0.4), 1)
        sentiment, score, opp = analyze_sentiment("", rating)
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
            "business_category": classify_business_category(f"Demo {category.title()}", [category]),
            "types":             [category.lower().replace(" ", "_")],
            "place_id":          f"stub_{i}",
        })
    return stubs
