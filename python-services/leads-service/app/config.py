"""Service configuration: every environment variable and tunable constant in one place."""
import os
from typing import Tuple

# ── Model paths ───────────────────────────────────────────────────────────────
MODEL_DIR: str = "model"
NER_MODEL_PATH: str = os.path.join(MODEL_DIR, "distilbert_ner_prod_v2")
SCORER_PATH: str = os.path.join(MODEL_DIR, "scorer", "xgboost_scorer.joblib")

# ── Environment ───────────────────────────────────────────────────────────────
# "demo" (default) never touches third-party sites; "live" enables real scraping.
SCRAPE_MODE: str = os.getenv("SCRAPE_MODE", "demo").lower()
# Per-request HTTP timeout (seconds) used by the live scrapers.
SCRAPE_TIMEOUT: int = int(os.getenv("SCRAPE_TIMEOUT", "12"))

# ── Scraping / enrichment constants ───────────────────────────────────────────
REQUEST_DELAY_RANGE: Tuple[float, float] = (2.5, 4.5)  # polite delay between requests (s)
MAX_SCRAPE_RESULTS: int = 50   # hard cap on leads requested from a live scrape
MAX_DEMO_LEADS: int = 20       # cap on demo rows returned when falling back
NER_MAX_CHARS: int = 512       # bio characters fed to the NER model
NER_MIN_SCORE: float = 0.80    # entities below this confidence are ignored

# Order matters: it is the feature order the XGBoost scorer was trained on
# (model/scorer/training_summary.json) and must match ScoreRequest's fields.
SCORER_FEATURES: Tuple[str, ...] = (
    "platform_origin",
    "job_title_seniority",
    "has_email",
    "has_phone",
    "company_size_indicator",
    "engagement_estimate",
    "industry_signal",
    "bio_completeness",
)
