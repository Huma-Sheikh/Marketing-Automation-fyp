"""Service configuration: every environment variable and tunable constant in one place."""
import os

# ── Environment ───────────────────────────────────────────────────────────────
# The trained checkpoints live in model/ (singular) — see README. Overridable
# so the Docker image and a local checkout can point at different locations.
MODELS_DIR: str = os.getenv("MODELS_DIR", "model")
# Google Places API key; empty = stub data for /search and /find-opportunities.
GOOGLE_API_KEY: str = os.getenv("GOOGLE_PLACES_API_KEY", "")
# Below this softmax score we prefer the Google Places `types` mapping over the
# classifier — see classification.classify_business_category().
CATEGORY_MIN_CONFIDENCE: float = float(os.getenv("CATEGORY_MIN_CONFIDENCE", "0.75"))

# ── Model paths ───────────────────────────────────────────────────────────────
SENTIMENT_MODEL_DIR: str = os.path.join(MODELS_DIR, "sentiment_roberta")
CATEGORY_MODEL_DIR: str = os.path.join(MODELS_DIR, "business_category")
CATEGORY_INFO_FILE: str = "training_info.json"  # inside CATEGORY_MODEL_DIR

# ── Google Places API ─────────────────────────────────────────────────────────
PLACES_NEARBY_URL: str = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
PLACES_TEXT_SEARCH_URL: str = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL: str = "https://maps.googleapis.com/maps/api/place/details/json"
# Fields to fetch (each costs API credits — only fetch what you need)
PLACES_DETAILS_FIELDS: str = (
    "name,rating,user_ratings_total,formatted_address,formatted_phone_number,"
    "international_phone_number,website,opening_hours,business_status,url,reviews,geometry"
)
PLACES_HTTP_TIMEOUT: int = 10        # seconds per Places request
PLACES_MAX_PAGES: int = 3            # Google returns at most 3 pages (60 results)
PLACES_PAGE_DELAY_SECONDS: int = 2   # required delay before a next_page_token is valid

# ── Inference / response limits ───────────────────────────────────────────────
MODEL_MAX_CHARS: int = 512           # text characters fed to either classifier
DEFAULT_CATEGORY: str = "Professional Services"
ANALYZE_MAX_TEXTS: int = 200         # /analyze cap, to avoid timeouts
SNIPPET_MAX_CHARS: int = 200         # review / echoed-text truncation in responses
MAX_STUB_BUSINESSES: int = 8
OPPORTUNITY_MAX_RATING: float = 3.5  # /find-opportunities default max_rating
OPPORTUNITY_MIN_RATING: float = 1.0  # /find-opportunities default min_rating
