"""Model state and loading for the NER pipeline and the XGBoost lead scorer.

``load_models()`` is called once at import time of ``main`` (eager, as before).
Missing files leave the globals at ``None`` and the routes use stub logic.
"""
import logging
import os
from typing import Any

from app.config import NER_MODEL_PATH, SCORER_PATH

logger = logging.getLogger(__name__)

ner_model: Any = None     # transformers token-classification pipeline
scorer_model: Any = None  # XGBRegressor loaded via joblib


def load_models() -> None:
    """Load the NER pipeline and lead scorer if their files exist."""
    global ner_model, scorer_model

    if os.path.exists(NER_MODEL_PATH):
        try:
            from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline
            tokenizer = AutoTokenizer.from_pretrained(NER_MODEL_PATH)
            model = AutoModelForTokenClassification.from_pretrained(NER_MODEL_PATH)
            ner_model = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")
            logger.info("NER model loaded")
        except Exception as e:
            logger.warning("NER model load failed: %s", e)
    else:
        logger.info("NER model not found - stub mode")

    if os.path.exists(SCORER_PATH):
        try:
            import joblib
            scorer_model = joblib.load(SCORER_PATH)
            logger.info("Lead scorer loaded (XGBRegressor via joblib)")
        except Exception as e:
            logger.warning("Scorer load failed: %s", e)
    else:
        logger.info("Lead scorer not found - stub mode")
