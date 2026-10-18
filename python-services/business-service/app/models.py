"""Model state and loading for the sentiment (RoBERTa) and category (DistilBERT) classifiers.

``load_models()`` is called once at import time of ``main`` (eager, as before).
Missing checkpoints leave the globals at ``None``; sentiment then falls back to
the star rating and category to the Google Places ``types`` mapping.
"""
import json
import logging
import os
from typing import Any, Dict

from app.config import CATEGORY_INFO_FILE, CATEGORY_MODEL_DIR, SENTIMENT_MODEL_DIR
from app.reference_data import BUSINESS_CATEGORIES

logger = logging.getLogger(__name__)

sentiment_model: Any = None  # RoBERTa fine-tuned on Yelp+Amazon+Twitter
category_model: Any = None   # DistilBERT fine-tuned on 10 business categories
# Label id -> category name; replaced by the checkpoint's training_info.json if present.
business_categories: Dict[int, str] = dict(BUSINESS_CATEGORIES)


def cuda_available() -> bool:
    """True if torch is installed and sees a CUDA device."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def load_models() -> None:
    """Load both classifiers (trained by colab_02_sentiment_training.py) if present."""
    global sentiment_model, category_model, business_categories

    # ── Sentiment model ──
    if os.path.exists(SENTIMENT_MODEL_DIR):
        try:
            from transformers import pipeline
            sentiment_model = pipeline(
                "text-classification",
                model=SENTIMENT_MODEL_DIR,
                device=0 if cuda_available() else -1,
            )
            logger.info("Sentiment model loaded (fine-tuned RoBERTa)")
        except Exception as e:
            logger.warning("Sentiment model load failed: %s", e)
    else:
        logger.info("Sentiment model not found — using rating-based fallback")

    # ── Business category model ──
    if os.path.exists(CATEGORY_MODEL_DIR):
        try:
            from transformers import pipeline
            # Load category labels from saved config
            config_file = os.path.join(CATEGORY_MODEL_DIR, CATEGORY_INFO_FILE)
            if os.path.exists(config_file):
                with open(config_file) as f:
                    cfg = json.load(f)
                    business_categories = {
                        int(k): v for k, v in cfg.get("categories", business_categories).items()
                    }

            category_model = pipeline(
                "text-classification",
                model=CATEGORY_MODEL_DIR,
                device=0 if cuda_available() else -1,
            )
            logger.info("Business category model loaded (fine-tuned DistilBERT)")
        except Exception as e:
            logger.warning("Category model load failed: %s", e)
    else:
        logger.info("Category model not found — category field will be empty")
