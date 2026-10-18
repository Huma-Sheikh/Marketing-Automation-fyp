"""Sentiment and business-category classification (models with deterministic fallbacks)."""
import logging
from typing import List, Optional, Tuple

from app import models
from app.config import CATEGORY_MIN_CONFIDENCE, DEFAULT_CATEGORY, MODEL_MAX_CHARS
from app.reference_data import DEFAULT_OPPORTUNITY_TEXT, OPPORTUNITY_TEXT, TYPE_CATEGORY_MAP

logger = logging.getLogger(__name__)


def rating_to_sentiment(rating: Optional[float]) -> Tuple[str, float]:
    """Map a 0-5 star rating to ``(label, score)``; None -> NEUTRAL 0.5."""
    if rating is None:
        return "NEUTRAL", 0.5
    if rating < 3.0:
        return "NEGATIVE", round(1.0 - (rating / 5.0), 2)
    elif rating < 4.0:
        return "NEUTRAL", 0.5
    else:
        return "POSITIVE", round(rating / 5.0, 2)


def analyze_sentiment(review_text: str, rating: Optional[float]) -> Tuple[str, float, str]:
    """
    Analyze review sentiment. Uses trained RoBERTa model if available,
    otherwise falls back to rating-based logic.
    Returns (sentiment_label, confidence_score, opportunity_text)
    """
    if models.sentiment_model and review_text.strip():
        try:
            result = models.sentiment_model(review_text[:MODEL_MAX_CHARS])[0]
            raw_label = result["label"].upper()
            score = round(result["score"], 3)
        except Exception as e:
            logger.warning("Sentiment model failed, using rating fallback: %s", e)
            raw_label, score = rating_to_sentiment(rating)
    else:
        raw_label, score = rating_to_sentiment(rating)

    # Normalise label regardless of model output format
    # Trained model outputs: NEGATIVE / NEUTRAL / POSITIVE
    # Legacy/untrained: LABEL_0 / LABEL_1 / LABEL_2
    if raw_label in ("LABEL_0", "0", "NEGATIVE"):
        label = "NEGATIVE"
    elif raw_label in ("LABEL_2", "2", "POSITIVE"):
        label = "POSITIVE"
    else:
        label = "NEUTRAL"

    return label, score, OPPORTUNITY_TEXT.get(label, DEFAULT_OPPORTUNITY_TEXT)


def category_from_types(types: List[str]) -> Optional[str]:
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


def classify_business_category(name: str, types: List[str], bio: str = "") -> str:
    """
    Classify a business into one of 10 categories.

    Order matters: Google's `types` field is ground truth supplied by the place
    itself, while the fine-tuned classifier is an inference from a short name.
    The classifier was previously consulted first and would confidently override
    `types` with a wrong answer - a dentist coming back as "Food & Beverage" -
    so it now only runs when `types` carries no usable signal (as in /analyze,
    which has text but no place data).
    """
    from_types = category_from_types(types)
    if from_types:
        return from_types

    if models.category_model:
        text = f"{name}. {bio}"[:MODEL_MAX_CHARS].strip(". ").strip()
        if text:
            try:
                result = models.category_model(text)[0]
                if result.get("score", 0) >= CATEGORY_MIN_CONFIDENCE:
                    label = result["label"]
                    label_id = int(label.replace("LABEL_", "")) if label.startswith("LABEL_") else 0
                    return models.business_categories.get(label_id, DEFAULT_CATEGORY)
            except Exception as e:
                logger.warning("Category model failed, using default category: %s", e)

    return DEFAULT_CATEGORY
