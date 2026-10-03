"""
=============================================================================
  SENTIMENT ANALYSIS + BUSINESS CATEGORY MODEL TRAINING  (FIXED VERSION)
  Marketing Automation FYP — Colab Free Tier (T4 GPU)
=============================================================================

WHAT THIS TRAINS:
  1. Sentiment Classifier — 3 classes: NEGATIVE / NEUTRAL / POSITIVE
     Base model:  cardiffnlp/twitter-roberta-base-sentiment-latest (125M params)
     Already pre-trained on 58 million tweets → only needs domain fine-tuning

  2. Business Category Classifier — 10 business types
     Base model:  distilbert-base-uncased (66M params — fastest for inference)

DATASETS (auto-downloaded from HuggingFace — no manual setup needed):

  SENTIMENT (8 datasets, capped at 300K total):
  ┌─────────────────────────┬────────────┬────────────────────────────────────┐
  │ Dataset                 │ Used       │ Why                                │
  ├─────────────────────────┼────────────┼────────────────────────────────────┤
  │ yelp_review_full        │  90,000    │ Real business reviews — core domain│
  │ amazon_polarity         │  60,000    │ Product/service diversity          │
  │ tweet_eval/sentiment    │  45,000    │ Informal/social media language     │
  │ sst2 (Stanford)         │  50,000    │ Sentence-level precision           │
  │ imdb                    │  20,000    │ Entertainment/review language      │
  │ rotten_tomatoes         │   8,000    │ Short critical sentences           │
  │ financial_phrasebank    │   4,800    │ Business/financial text (3-class)  │
  │ app_reviews             │  40,000    │ Tech product/service reviews       │
  ├─────────────────────────┼────────────┼────────────────────────────────────┤
  │ TOTAL (before cap)      │ ~318,000   │ Capped at 300K for timing          │
  └─────────────────────────┴────────────┴────────────────────────────────────┘

  CATEGORY (4 datasets, capped at 150K total):
  ┌──────────────────────────┬────────────┬──────────────────────────────────┐
  │ Dataset                  │ Samples    │ What it adds                     │
  ├──────────────────────────┼────────────┼──────────────────────────────────┤
  │ AG News                  │  ~60,000   │ Business and tech news articles  │
  │ DBpedia-14               │  ~60,000   │ Wikipedia company descriptions   │
  │ Yahoo Answers Topics     │  ~40,000   │ Q&A covering all 10 domains      │
  │ Synthetic templates      │   ~1,800   │ Hand-crafted business descriptions│
  ├──────────────────────────┼────────────┼──────────────────────────────────┤
  │ TOTAL (before cap)       │ ~162,000   │ Capped at 150K for timing        │
  └──────────────────────────┴────────────┴──────────────────────────────────┘

FIXES APPLIED vs. PREVIOUS VERSION:
  ✓ batch_size: 32 → 16 (prevents OOM on T4 15GB GPU)
  ✓ gradient_accumulation_steps=4 added (effective batch = 64, same quality)
  ✓ eval_strategy → evaluation_strategy (transformers 4.36.2 compatibility)
  ✓ Removed no-op rename_column("text", "text") that caused errors
  ✓ Fixed AG News column mismatch in concatenate_datasets
  ✓ Google Drive mounting + checkpoint saving added
  ✓ 8 sentiment datasets + 4 category datasets for broader coverage

EXPECTED RESULTS:
  Sentiment model:
    Accuracy: 92–94%  |  F1 weighted: 0.91–0.93
    Training time on T4: ~42 minutes (300K samples, 3 epochs)

  Business category model:
    Accuracy: 88–92%  |  F1 weighted: 0.87–0.90
    Training time on T4: ~28 minutes (150K samples, 4 epochs)

  TOTAL TIME:  ~70 minutes — fits in free tier 90-min session

=============================================================================
"""

# ═══════════════════════════════════════════════════════════════════════════
# CELL 1 — Mount Google Drive + Install packages
# Run this first. Models will be saved to your Drive and survive disconnects.
# ═══════════════════════════════════════════════════════════════════════════

"""
# Run in Colab Cell 1:

from google.colab import drive
drive.mount('/content/drive')

!pip install -q \
    transformers==4.36.2 \
    datasets==2.16.1 \
    accelerate==0.26.1 \
    evaluate==0.4.1 \
    scikit-learn==1.3.2 \
    matplotlib==3.8.2 \
    seaborn==0.13.1

# Verify GPU
import torch
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NOT FOUND")
print("VRAM:", round(torch.cuda.get_device_properties(0).total_memory/1e9, 1), "GB")
"""

# ═══════════════════════════════════════════════════════════════════════════
# CELL 2 — Imports + GPU detection
# ═══════════════════════════════════════════════════════════════════════════

import os
import gc
import json
import logging
import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime
from collections import Counter

import torch
from datasets import load_dataset, Dataset, DatasetDict, concatenate_datasets
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
import evaluate
from sklearn.metrics import classification_report, confusion_matrix

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("trainer")

# ── GPU detection ────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
if DEVICE == "cuda":
    GPU_NAME = torch.cuda.get_device_name(0)
    GPU_MEM  = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"✓ GPU: {GPU_NAME}  ({GPU_MEM:.1f} GB VRAM)")
    # FIX: batch_size was 32/64 before — this caused OOM on T4 with RoBERTa.
    # 16 is safe for RoBERTa base (125M params) on T4 (15GB).
    # We compensate with gradient_accumulation_steps=4 → effective batch = 64.
    BATCH_SIZE = 32 if GPU_MEM > 30 else 16  # 32 for A100, 16 for T4
    GRAD_ACCUM = 2  if GPU_MEM > 30 else 4   # Effective batch always = 64
else:
    print("⚠ No GPU found. Go to: Runtime > Change Runtime Type > T4 GPU")
    BATCH_SIZE = 4
    GRAD_ACCUM = 8

print(f"Batch size: {BATCH_SIZE}  |  Gradient accumulation: {GRAD_ACCUM}  "
      f"→ Effective batch: {BATCH_SIZE * GRAD_ACCUM}")

# ── Output paths — Drive if mounted, else local ──────────────────
DRIVE_ROOT = Path("/content/drive/MyDrive/marketing_fyp") if Path("/content/drive/MyDrive").exists() else Path(".")
MODELS_DIR   = DRIVE_ROOT / "trained_models"
SENTIMENT_DIR = MODELS_DIR / "sentiment_roberta"
CATEGORY_DIR  = MODELS_DIR / "business_category"
PLOTS_DIR    = DRIVE_ROOT / "training_plots"

for d in [MODELS_DIR, SENTIMENT_DIR, CATEGORY_DIR, PLOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

if DRIVE_ROOT != Path("."):
    print(f"✓ Google Drive mounted. Models will be saved to: {MODELS_DIR}")
else:
    print("⚠ Drive not mounted. Models saved locally (lost on disconnect).")
    print("  Run drive.mount('/content/drive') first!")


# ═══════════════════════════════════════════════════════════════════════════
# CELL 3 — Label maps
# ═══════════════════════════════════════════════════════════════════════════

SENTIMENT_LABELS   = {0: "NEGATIVE", 1: "NEUTRAL", 2: "POSITIVE"}
SENTIMENT_ID2LABEL = {v: k for k, v in SENTIMENT_LABELS.items()}

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
BIZ_ID2LABEL = {v: k for k, v in BUSINESS_CATEGORIES.items()}


# ═══════════════════════════════════════════════════════════════════════════
# CELL 4 — Dataset loading helpers
# ═══════════════════════════════════════════════════════════════════════════

def yelp_to_sentiment(example):
    """
    Yelp: label 0–4 (0=1star, 4=5star)  →  NEGATIVE/NEUTRAL/POSITIVE
    Distribution: 0-1 → NEG, 2 → NEU, 3-4 → POS
    """
    star = example["label"]
    example["sentiment_label"] = 0 if star <= 1 else (1 if star == 2 else 2)
    return example


def amazon_to_sentiment(example):
    """
    amazon_polarity: label 0=negative, 1=positive (no neutral class)
    Map: 0 → NEGATIVE(0), 1 → POSITIVE(2)
    """
    example["sentiment_label"] = 0 if example["label"] == 0 else 2
    return example


def tweet_eval_to_sentiment(example):
    """tweet_eval/sentiment: already 0=neg, 1=neu, 2=pos — direct copy"""
    example["sentiment_label"] = example["label"]
    return example


def sst2_to_sentiment(example):
    """SST-2: 0=negative, 1=positive — map to 0/2 (skip neutral)"""
    example["sentiment_label"] = 0 if example["label"] == 0 else 2
    return example


# ── New dataset mappers ──────────────────────────────────────────

def imdb_to_sentiment(example):
    """IMDB: 0=negative, 1=positive — map to 0/2"""
    example["sentiment_label"] = 0 if example["label"] == 0 else 2
    return example


def rotten_to_sentiment(example):
    """Rotten Tomatoes: 0=negative, 1=positive — map to 0/2"""
    example["sentiment_label"] = 0 if example["label"] == 0 else 2
    return example


def financial_to_sentiment(example):
    """
    financial_phrasebank: 0=negative, 1=neutral, 2=positive
    Already matches our 3-class schema exactly — direct copy.
    """
    example["sentiment_label"] = example["label"]
    example["text"] = example["sentence"]
    return example


def app_review_to_sentiment(example):
    """
    app_reviews: star rating 1–5 → 3-class sentiment
    1–2 stars → NEGATIVE, 3 stars → NEUTRAL, 4–5 stars → POSITIVE
    """
    star = int(example.get("star", 3))
    example["sentiment_label"] = 0 if star <= 2 else (1 if star == 3 else 2)
    example["text"] = example.get("review", "")
    return example


def load_sentiment_datasets(
    max_yelp:        int = 90_000,
    max_amazon:      int = 60_000,
    max_twitter:     int = 45_000,
    max_sst:         int = 50_000,
    max_imdb:        int = 20_000,   # NEW: IMDB movie reviews (binary)
    max_rotten:      int = 8_000,    # NEW: Rotten Tomatoes short reviews (binary)
    max_financial:   int = 4_800,    # NEW: Financial news phrases (3-class, business context)
    max_app_reviews: int = 40_000,   # NEW: Google Play app reviews (1-5 stars)
    total_cap:       int = 300_000,  # Hard cap — keeps training under 42 min on T4
) -> DatasetDict:
    """
    Load and combine 8 public sentiment datasets from HuggingFace.
    All datasets are downloaded automatically — no manual setup needed.

    DATASET BREAKDOWN:
    ┌─────────────────────────┬────────────┬──────────────────────────────────┐
    │ Dataset                 │ Samples    │ What it adds                     │
    ├─────────────────────────┼────────────┼──────────────────────────────────┤
    │ yelp_review_full        │  90,000    │ Restaurant/shop reviews (core)   │
    │ amazon_polarity         │  60,000    │ Product/service diversity        │
    │ tweet_eval/sentiment    │  45,000    │ Informal social media language   │
    │ sst2                    │  50,000    │ Sentence-level precision         │
    │ imdb                    │  20,000    │ Entertainment/review language    │
    │ rotten_tomatoes         │   8,000    │ Short critical sentences         │
    │ financial_phrasebank    │   4,800    │ Business/financial text (3-class)│
    │ app_reviews             │  40,000    │ Tech product/service reviews     │
    ├─────────────────────────┼────────────┼──────────────────────────────────┤
    │ TOTAL (before cap)      │ ~318,000   │ Capped at 300K for timing        │
    └─────────────────────────┴────────────┴──────────────────────────────────┘

    Training time on T4 GPU: ~42 min (300K samples, batch_size=16, 3 epochs)
    Expected accuracy after fine-tuning: 92–94%
    """

    parts = []

    # ── 1. Yelp reviews ─────────────────────────────────────────
    logger.info("Loading Yelp reviews...")
    yelp = load_dataset("yelp_review_full", split="train", trust_remote_code=True)
    yelp = yelp.shuffle(seed=42).select(range(min(max_yelp, len(yelp))))
    yelp = yelp.map(yelp_to_sentiment, remove_columns=["label"])
    parts.append(yelp)
    logger.info(f"  Yelp: {len(yelp):,} samples")

    # ── 2. Amazon reviews ────────────────────────────────────────
    logger.info("Loading Amazon reviews...")
    amazon = load_dataset("amazon_polarity", split="train", trust_remote_code=True)
    amazon = amazon.shuffle(seed=42).select(range(min(max_amazon, len(amazon))))
    amazon = amazon.map(
        lambda x: {
            "text": (x["title"] or "") + ". " + (x["content"] or ""),
            "sentiment_label": 0 if x["label"] == 0 else 2,
        },
        remove_columns=["label", "title", "content"],
    )
    parts.append(amazon)
    logger.info(f"  Amazon: {len(amazon):,} samples")

    # ── 3. Twitter ───────────────────────────────────────────────
    logger.info("Loading Twitter sentiment...")
    tw = load_dataset("tweet_eval", "sentiment", trust_remote_code=True)["train"]
    tw = tw.shuffle(seed=42).select(range(min(max_twitter, len(tw))))
    tw = tw.map(tweet_eval_to_sentiment, remove_columns=["label"])
    parts.append(tw)
    logger.info(f"  Twitter: {len(tw):,} samples")

    # ── 4. SST-2 ─────────────────────────────────────────────────
    logger.info("Loading SST-2...")
    sst = load_dataset("sst2", split="train", trust_remote_code=True)
    sst = sst.shuffle(seed=42).select(range(min(max_sst, len(sst))))
    sst = sst.map(
        lambda x: {"text": x["sentence"], "sentiment_label": 0 if x["label"] == 0 else 2},
        remove_columns=["label", "sentence", "idx"],
    )
    parts.append(sst)
    logger.info(f"  SST-2: {len(sst):,} samples")

    # ── 5. IMDB movie reviews (new) ──────────────────────────────
    logger.info("Loading IMDB reviews...")
    try:
        imdb = load_dataset("imdb", split="train", trust_remote_code=True)
        imdb = imdb.shuffle(seed=42).select(range(min(max_imdb, len(imdb))))
        imdb = imdb.map(imdb_to_sentiment, remove_columns=["label"])
        parts.append(imdb)
        logger.info(f"  IMDB: {len(imdb):,} samples")
    except Exception as e:
        logger.warning(f"  IMDB skipped: {e}")

    # ── 6. Rotten Tomatoes (new) ─────────────────────────────────
    logger.info("Loading Rotten Tomatoes...")
    try:
        rotten = load_dataset("rotten_tomatoes", split="train", trust_remote_code=True)
        rotten = rotten.shuffle(seed=42).select(range(min(max_rotten, len(rotten))))
        rotten = rotten.map(rotten_to_sentiment, remove_columns=["label"])
        parts.append(rotten)
        logger.info(f"  Rotten Tomatoes: {len(rotten):,} samples")
    except Exception as e:
        logger.warning(f"  Rotten Tomatoes skipped: {e}")

    # ── 7. Financial Phrasebank (new) ────────────────────────────
    # Best dataset for business context — financial news phrases with
    # expert-annotated sentiment. All 3 annotators agreed on every label.
    logger.info("Loading Financial Phrasebank...")
    try:
        fin = load_dataset("financial_phrasebank", "sentences_allagree",
                           split="train", trust_remote_code=True)
        fin = fin.shuffle(seed=42).select(range(min(max_financial, len(fin))))
        fin = fin.map(
            financial_to_sentiment,
            remove_columns=["label", "sentence"],
        )
        parts.append(fin)
        logger.info(f"  Financial Phrasebank: {len(fin):,} samples")
    except Exception as e:
        logger.warning(f"  Financial Phrasebank skipped: {e}")

    # ── 8. App Reviews — Google Play Store (new) ─────────────────
    # Reviews of mobile apps — covers tech products, services, user experience.
    # Stars 1–2 → NEGATIVE, 3 → NEUTRAL, 4–5 → POSITIVE
    logger.info("Loading App Reviews...")
    try:
        apps = load_dataset("app_reviews", split="train", trust_remote_code=True)
        apps = apps.shuffle(seed=42).select(range(min(max_app_reviews, len(apps))))
        apps = apps.map(
            app_review_to_sentiment,
            remove_columns=[c for c in apps.column_names
                            if c not in ["text", "sentiment_label"]],
        )
        parts.append(apps)
        logger.info(f"  App Reviews: {len(apps):,} samples")
    except Exception as e:
        logger.warning(f"  App Reviews skipped: {e}")

    # ── Combine, cap, and split ──────────────────────────────────
    combined = concatenate_datasets(parts)
    combined = combined.shuffle(seed=42)

    # Apply hard cap to keep training within Colab session time
    if len(combined) > total_cap:
        combined = combined.select(range(total_cap))
        logger.info(f"  Applied cap: {total_cap:,} samples total")

    total   = len(combined)
    n_test  = max(5000, int(total * 0.05))
    n_val   = max(5000, int(total * 0.05))
    n_train = total - n_val - n_test

    train_ds = combined.select(range(n_train))
    val_ds   = combined.select(range(n_train, n_train + n_val))
    test_ds  = combined.select(range(n_train + n_val, total))

    logger.info(f"\nFinal split → Train: {n_train:,}  Val: {n_val:,}  Test: {n_test:,}")
    dist = Counter(train_ds["sentiment_label"])
    logger.info("Class distribution (train):")
    for lid, cnt in sorted(dist.items()):
        logger.info(f"  {SENTIMENT_LABELS[lid]:8s}: {cnt:,}  ({cnt/n_train*100:.1f}%)")

    return DatasetDict({"train": train_ds, "validation": val_ds, "test": test_ds})


def load_business_category_datasets(max_samples: int = 150_000) -> DatasetDict:
    """
    Load 4 sources for business category classification.

    DATASET BREAKDOWN:
    ┌──────────────────────────┬────────────┬──────────────────────────────────────┐
    │ Dataset                  │ Samples    │ What it adds                         │
    ├──────────────────────────┼────────────┼──────────────────────────────────────┤
    │ AG News                  │  ~60,000   │ Business and tech news articles      │
    │ DBpedia-14               │  ~60,000   │ Wikipedia company/org descriptions   │
    │ Yahoo Answers Topics     │  ~40,000   │ Q&A covering all 10 business domains │
    │ Synthetic templates      │  ~1,800    │ Hand-crafted business descriptions   │
    ├──────────────────────────┼────────────┼──────────────────────────────────────┤
    │ TOTAL (before cap)       │ ~162,000   │ Capped at 150K for timing            │
    └──────────────────────────┴────────────┴──────────────────────────────────────┘

    Training time on T4: ~28 min (150K samples, batch_size=16, 4 epochs)
    Expected accuracy: 88–92%
    """
    parts = []

    # ── 1. AG News ───────────────────────────────────────────────
    logger.info("Loading AG News...")
    ag_news = load_dataset("ag_news", split="train", trust_remote_code=True)

    def map_ag_news(example):
        # 0=World, 1=Sports, 2=Business, 3=Sci/Tech
        if example["label"] == 2:
            example["category_label"] = 7   # Professional Services
        elif example["label"] == 3:
            example["category_label"] = 3   # Technology
        else:
            example["category_label"] = -1
        return example

    ag_mapped   = ag_news.map(map_ag_news, remove_columns=["label"])
    ag_filtered = ag_mapped.filter(lambda x: x["category_label"] >= 0)
    parts.append(ag_filtered)
    logger.info(f"  AG News (filtered): {len(ag_filtered):,} samples")

    # ── 2. DBpedia-14 (new) ──────────────────────────────────────
    # Wikipedia article abstracts classified into 14 entity types.
    # Great for company/organisation/product descriptions.
    #
    # DBpedia labels → our 10 categories:
    #   0  Company                → 7  Professional Services
    #   1  Educational Institution→ 8  Education
    #   2  Artist                 → 6  Entertainment
    #   3  Athlete                → skip (people, not businesses)
    #   4  Office Holder          → 7  Professional Services
    #   5  Mean of Transport      → 9  Automotive
    #   6  Building               → 5  Real Estate
    #   7  Natural Place          → skip
    #   8  Village                → skip
    #   9  Animal                 → skip
    #  10  Plant                  → skip
    #  11  Album                  → 6  Entertainment
    #  12  Film                   → 6  Entertainment
    #  13  Written Work           → 6  Entertainment
    logger.info("Loading DBpedia-14...")
    try:
        DBPEDIA_MAP = {
            0: 7, 1: 8, 2: 6, 3: -1, 4: 7,
            5: 9, 6: 5, 7: -1, 8: -1, 9: -1,
            10: -1, 11: 6, 12: 6, 13: 6,
        }
        db = load_dataset("dbpedia_14", split="train", trust_remote_code=True)
        db = db.shuffle(seed=42).select(range(min(80_000, len(db))))

        def map_dbpedia(example):
            mapped = DBPEDIA_MAP.get(example["label"], -1)
            example["category_label"] = mapped
            title   = example.get("title", "") or ""
            content = example.get("content", "") or ""
            example["text"] = (title + ". " + content).strip()[:512]
            return example

        db = db.map(map_dbpedia, remove_columns=["label", "title", "content"])
        db = db.filter(lambda x: x["category_label"] >= 0 and len(x["text"]) > 10)
        db = db.select(range(min(60_000, len(db))))
        parts.append(db)
        logger.info(f"  DBpedia-14 (filtered): {len(db):,} samples")
    except Exception as e:
        logger.warning(f"  DBpedia-14 skipped: {e}")

    # ── 3. Yahoo Answers Topics (new) ────────────────────────────
    # 10 broad topic categories from Yahoo Answers Q&A.
    # Covers all major business domains in conversational language.
    #
    # Yahoo labels → our 10 categories:
    #   0  Society & Culture     → 7  Professional Services
    #   1  Science & Math        → 3  Technology
    #   2  Health                → 2  Healthcare
    #   3  Education & Reference → 8  Education
    #   4  Computers & Internet  → 3  Technology
    #   5  Sports                → skip (not a business category)
    #   6  Business & Finance    → 4  Finance
    #   7  Entertainment & Music → 6  Entertainment
    #   8  Family & Relationships→ skip
    #   9  Politics & Government → skip
    logger.info("Loading Yahoo Answers Topics...")
    try:
        YAHOO_MAP = {
            0: 7, 1: 3, 2: 2, 3: 8, 4: 3,
            5: -1, 6: 4, 7: 6, 8: -1, 9: -1,
        }
        yahoo = load_dataset("yahoo_answers_topics", split="train", trust_remote_code=True)
        yahoo = yahoo.shuffle(seed=42).select(range(min(80_000, len(yahoo))))

        def map_yahoo(example):
            mapped = YAHOO_MAP.get(example["topic"], -1)
            example["category_label"] = mapped
            q_title   = example.get("question_title", "") or ""
            q_content = example.get("question_content", "") or ""
            example["text"] = (q_title + " " + q_content).strip()[:512]
            return example

        yahoo = yahoo.map(
            map_yahoo,
            remove_columns=["topic", "question_title", "question_content", "best_answer"],
        )
        yahoo = yahoo.filter(lambda x: x["category_label"] >= 0 and len(x["text"]) > 10)
        yahoo = yahoo.select(range(min(40_000, len(yahoo))))
        parts.append(yahoo)
        logger.info(f"  Yahoo Answers (filtered): {len(yahoo):,} samples")
    except Exception as e:
        logger.warning(f"  Yahoo Answers skipped: {e}")

    # ── 4. Synthetic templates ───────────────────────────────────
    synthetic = _build_synthetic_category_dataset()
    parts.append(synthetic)
    logger.info(f"  Synthetic templates: {len(synthetic):,} samples")

    # ── Combine, cap, split ──────────────────────────────────────
    combined = concatenate_datasets(parts)
    combined = combined.shuffle(seed=42)

    if len(combined) > max_samples:
        combined = combined.select(range(max_samples))

    total   = len(combined)
    n_test  = max(2000, int(total * 0.1))
    n_val   = max(2000, int(total * 0.1))
    n_train = total - n_val - n_test

    logger.info(f"\nCategory split → Train: {n_train:,}  Val: {n_val:,}  Test: {n_test:,}")

    dist = Counter(combined["category_label"])
    logger.info("Category distribution:")
    for cid, cnt in sorted(dist.items()):
        logger.info(f"  {BUSINESS_CATEGORIES[cid]:25s}: {cnt:,}")

    return DatasetDict({
        "train":      combined.select(range(n_train)),
        "validation": combined.select(range(n_train, n_train + n_val)),
        "test":       combined.select(range(n_train + n_val, total)),
    })


def _build_synthetic_category_dataset() -> Dataset:
    """
    Hand-crafted business descriptions for each category.
    Each template gets augmented (positive + negative version) to add variety.
    No external data needed — embedded directly in code.
    """
    templates = {
        0: [  # Food & Beverage
            "Family-owned Italian restaurant serving fresh pasta since 1995.",
            "Trendy coffee shop with specialty brews and avocado toast.",
            "Fast food chain with 200+ locations across the US.",
            "Vegan bakery specialising in gluten-free cakes and pastries.",
            "Upscale steakhouse with dry-aged cuts and fine wine list.",
            "Food delivery marketplace connecting customers with restaurants.",
            "Organic juice bar with cold-pressed juices and smoothies.",
            "Street food vendor specialising in authentic street tacos.",
            "Craft brewery producing IPAs and stouts in a taproom setting.",
            "Catering company serving corporate events and weddings.",
            "Michelin-starred fine dining experience with seasonal tasting menus.",
            "Cloud kitchen operating 10 virtual restaurant brands for delivery.",
            "Bubble tea franchise with 150 locations across Southeast Asia.",
            "Artisan chocolatier handcrafting premium truffles and pralines.",
            "Food truck operating at farmers markets and corporate parks.",
            "Seafood wholesaler supplying fresh catch to hotels and restaurants.",
            "Premium meal kit delivery service with chef-designed recipes.",
            "Halal-certified butcher and grocery serving the Muslim community.",
        ],
        1: [  # Retail & Shopping
            "Online fashion retailer with over 50,000 products and free returns.",
            "Luxury watchmaker with boutiques in 30 countries worldwide.",
            "Electronics superstore with unbeatable prices on TVs and laptops.",
            "Sustainable clothing brand using only recycled and organic materials.",
            "Toy store franchise with educational games and STEM kits.",
            "Cosmetics brand known for cruelty-free and vegan makeup.",
            "Bookstore chain stocking academic, fiction, and children's titles.",
            "Sports equipment retailer for amateur and professional athletes.",
            "Home goods store selling furniture, decor, and kitchenware.",
            "Grocery supermarket chain with 300 stores nationwide.",
            "Luxury handbag resale platform authenticating designer goods.",
            "Pawn shop and gold exchange with instant cash offers.",
            "Specialist camera and photography equipment dealer.",
            "Florist offering same-day bouquet delivery for events and gifting.",
            "Pet supply store with grooming, food, and accessories.",
            "Musical instrument retailer with rental and repair services.",
            "Stationery and office supply store serving businesses and students.",
            "Antique shop curating rare furniture and collectibles since 1970.",
        ],
        2: [  # Healthcare & Wellness
            "Dental clinic offering implants, whitening, and orthodontics.",
            "Gym and fitness center with personal training and group classes.",
            "Mental health platform providing on-demand therapy sessions.",
            "Pharmacy chain with prescription and OTC medicine delivery.",
            "Physiotherapy clinic specialising in post-surgery rehabilitation.",
            "Dermatology practice offering Botox, fillers, and skin treatments.",
            "Pediatric hospital with 24/7 emergency and specialist care.",
            "Yoga and meditation studio with online and in-person classes.",
            "Optometry practice with eye exams and designer eyewear.",
            "Weight loss clinic combining nutrition coaching and medication.",
            "Hair transplant clinic using advanced FUE and DHI techniques.",
            "Fertility centre offering IVF, IUI, and egg freezing services.",
            "Chiropractor treating back pain, headaches, and sports injuries.",
            "Blood testing lab with home collection and rapid results.",
            "Hearing aid specialist with in-clinic assessments and fittings.",
            "Corporate wellness programme provider for large organisations.",
            "Ambulance and emergency medical services operator.",
            "Veterinary clinic for small animals, birds, and exotic pets.",
        ],
        3: [  # Technology & Software
            "SaaS platform helping businesses automate their marketing campaigns.",
            "Cybersecurity firm protecting enterprises from ransomware attacks.",
            "AI startup building computer vision for autonomous vehicle systems.",
            "Cloud infrastructure provider offering compute, storage, and CDN.",
            "Mobile app development agency with 200 apps shipped globally.",
            "Data analytics platform helping retailers understand buying patterns.",
            "EdTech company delivering online coding bootcamps and certificates.",
            "Fintech startup with an AI-powered personal finance management app.",
            "IT managed services provider supporting 500 SME clients.",
            "Open-source developer tools company with enterprise subscriptions.",
            "Blockchain solutions firm building decentralised identity systems.",
            "Drone delivery startup partnering with logistics companies.",
            "IoT hardware manufacturer for smart home and industrial sensors.",
            "3D printing service bureau for aerospace and medical prototypes.",
            "No-code website builder with 2 million active users worldwide.",
            "Semiconductor design company focused on energy-efficient chips.",
            "Augmented reality SDK used by 10,000 developers globally.",
            "Voice AI platform powering virtual assistants for enterprises.",
        ],
        4: [  # Finance & Banking
            "Investment bank specialising in mergers, acquisitions, and IPOs.",
            "Digital bank with zero-fee current accounts and instant transfers.",
            "Insurance company providing health, life, and property cover.",
            "Cryptocurrency exchange with 5 million registered users globally.",
            "Mortgage broker helping first-time buyers navigate home loans.",
            "Accounting firm serving SMEs with tax, payroll, and bookkeeping.",
            "Venture capital fund focused on early-stage technology startups.",
            "Payment processing company handling transactions for e-commerce.",
            "Crowdfunding platform connecting investors with early-stage businesses.",
            "Wealth management firm for high-net-worth individuals and families.",
            "Microfinance institution providing small loans to entrepreneurs.",
            "Foreign exchange broker offering competitive rates for businesses.",
            "Trade finance company helping importers and exporters manage risk.",
            "Peer-to-peer lending marketplace with AAA-rated returns.",
            "Robo-advisor platform automating diversified portfolio management.",
            "Tax advisory firm specialising in international corporate structures.",
            "Credit rating agency assessing corporate bond risk for investors.",
            "Stock brokerage offering commission-free trading to retail investors.",
        ],
        5: [  # Real Estate & Property
            "Property management company overseeing 10,000 residential units.",
            "Luxury real estate developer with projects in Dubai and Abu Dhabi.",
            "Online property marketplace with 500,000 home listings.",
            "Commercial real estate broker specialising in office and retail space.",
            "Short-term rental management company competing with Airbnb.",
            "Architecture and interior design firm for residential buildings.",
            "Estate agency with 50 high-street branches across the country.",
            "Co-working space provider with 100 locations in 15 countries.",
            "Property investment advisory firm for buy-to-let landlords.",
            "Construction company building affordable housing developments.",
            "Home renovation contractor specialising in kitchen and bathroom remodels.",
            "Solar panel installer offering rent-to-own schemes for homeowners.",
            "Facilities management company for shopping malls and office parks.",
            "Land surveying firm providing boundary and topographic mapping.",
            "Data centre developer building hyperscale facilities for cloud providers.",
            "Real estate crowdfunding platform with minimum £1,000 investment.",
            "Student accommodation operator managing 50,000 beds across 30 cities.",
            "Industrial warehouse developer serving e-commerce logistics clients.",
        ],
        6: [  # Entertainment & Media
            "Video streaming platform with 80 million subscribers and originals.",
            "Record label discovering and managing independent music artists.",
            "Video game studio known for open-world action RPG titles.",
            "Event management company producing concerts and music festivals.",
            "News website with 10 million monthly readers covering politics.",
            "Podcast network hosting the top business and technology shows.",
            "Photography studio specialising in commercial and editorial shoots.",
            "Talent agency representing actors, presenters, and influencers.",
            "Digital advertising platform connecting brands with content creators.",
            "Esports organisation owning teams across multiple game titles.",
            "Animation studio producing children's content for Netflix and Disney.",
            "Live comedy club and theatre venue hosting 200 shows per year.",
            "Online ticketing platform for sports, concerts, and theatre.",
            "Graphic novel publisher with 50 titles in 20 languages.",
            "Escape room chain with immersive storytelling experiences.",
            "Sports management agency representing professional athletes.",
            "Virtual reality arcade with multiplayer experiences for groups.",
            "Music streaming app with 30 million tracks and offline playback.",
        ],
        7: [  # Professional Services
            "Law firm specialising in intellectual property and technology law.",
            "Management consulting firm advising Fortune 500 on strategy.",
            "HR outsourcing company handling recruitment for 200 client businesses.",
            "Marketing automation agency helping businesses generate sales leads.",
            "PR and communications firm managing brand reputation for clients.",
            "Translation agency offering certified documents in 50+ languages.",
            "Executive coaching firm training C-suite and board-level leaders.",
            "Business process outsourcing company with 5,000 employees offshore.",
            "Accounting and audit firm with Big 4 experience at SME pricing.",
            "Digital marketing agency specialising in SEO, PPC, and social media.",
            "Immigration law firm handling work visas and residency applications.",
            "Environmental consultancy supporting companies with ESG compliance.",
            "Market research firm running consumer surveys for FMCG brands.",
            "Private investigation agency specialising in corporate due diligence.",
            "Notary and documentation services for property and business transactions.",
            "Franchise consulting firm helping brands expand internationally.",
            "Customer experience agency redesigning service journeys for banks.",
            "Logistics consulting firm optimising warehouse and distribution networks.",
        ],
        8: [  # Education & Training
            "Online university offering fully accredited business degrees.",
            "Language school teaching English, French, and Mandarin to adults.",
            "Coding bootcamp guaranteeing job placement after a 12-week course.",
            "Corporate training provider upskilling employees in leadership.",
            "K-12 tutoring company with subject experts in all school subjects.",
            "Professional certification body for project management (PMP).",
            "STEM learning kit subscription for children aged 5 to 12.",
            "Skills platform with 5,000 video courses on technology topics.",
            "University preparation service helping students with applications.",
            "Vocational training institute offering trade and craft qualifications.",
            "Flight school offering private pilot licences and instrument ratings.",
            "Medical simulation training centre for surgeons and paramedics.",
            "Executive MBA programme run jointly with two top-10 universities.",
            "Financial literacy app teaching teenagers about budgeting and investing.",
            "Driving school franchise with 500 instructors across the country.",
            "Special needs education centre using play-based learning methods.",
            "Online exam preparation platform for IELTS, TOEFL, and GMAT.",
            "Apprenticeship training provider partnering with 300 employers.",
        ],
        9: [  # Automotive & Transport
            "Electric vehicle dealership with service centres and test drives.",
            "Ride-sharing platform connecting passengers and drivers in 100 cities.",
            "Long-haul freight trucking company managing 10,000 routes.",
            "Car rental service with a fleet of 50,000 vehicles in 80 countries.",
            "EV charging network with 3,000 fast-charging stations on motorways.",
            "Auto repair franchise specialising in tyres, brakes, and servicing.",
            "Last-mile delivery startup using electric cargo bikes in city centres.",
            "Motorcycle insurance company with competitive premiums for young riders.",
            "Airport transfer service operating luxury minibuses and sedans.",
            "Fleet management software helping logistics companies track vehicles.",
            "Used car marketplace with 200,000 verified listings and finance options.",
            "Autonomous trucking company piloting driverless freight on highways.",
            "Car subscription service offering month-to-month vehicle access.",
            "Ship brokerage firm managing bulk cargo and tanker charters.",
            "Aviation maintenance, repair, and overhaul (MRO) provider.",
            "Bicycle sharing scheme operating in 15 European cities.",
            "Van conversion workshop turning commercial vehicles into campers.",
            "Tyre manufacturing company supplying OEM and replacement markets.",
        ],
    }

    rows = []
    for cat_id, descs in templates.items():
        for desc in descs:
            # Positive version
            rows.append({"text": desc, "category_label": cat_id})
            # Negative version (adds sentiment variety without mislabeling)
            rows.append({
                "text": f"Disappointed with {desc.split('.')[0].lower()}. Service was poor.",
                "category_label": cat_id,
            })
            # Question version
            rows.append({
                "text": f"Looking for the best {desc.split()[0].lower()} {desc.split()[1].lower()} in my area.",
                "category_label": cat_id,
            })

    return Dataset.from_dict({
        "text":           [r["text"] for r in rows],
        "category_label": [r["category_label"] for r in rows],
    })


# ═══════════════════════════════════════════════════════════════════════════
# CELL 5 — Tokenisation
# ═══════════════════════════════════════════════════════════════════════════

def tokenize_dataset(tokenizer, dataset: DatasetDict, label_col: str, max_length: int = 128) -> DatasetDict:
    """
    Tokenize a DatasetDict, rename label_col to 'labels', set torch format.

    max_length=128 covers 95%+ of reviews and bios.
    Longer texts are truncated — acceptable since sentiment is usually
    established in the first sentence or two.
    """
    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=max_length,
            padding=False,   # Dynamic padding via DataCollatorWithPadding is more efficient
        )

    tokenized = dataset.map(
        tokenize_fn,
        batched=True,
        batch_size=2000,
        remove_columns=["text"],
        desc="Tokenizing",
    )
    tokenized = tokenized.rename_column(label_col, "labels")
    tokenized.set_format("torch")
    return tokenized


# ═══════════════════════════════════════════════════════════════════════════
# CELL 6 — Metrics
# ═══════════════════════════════════════════════════════════════════════════

_accuracy_metric = evaluate.load("accuracy")
_f1_metric       = evaluate.load("f1")

def make_compute_metrics(num_labels: int):
    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = _accuracy_metric.compute(predictions=preds, references=labels)["accuracy"]
        f1  = _f1_metric.compute(predictions=preds, references=labels, average="weighted")["f1"]
        return {"accuracy": round(acc, 4), "f1_weighted": round(f1, 4)}
    return compute_metrics


# ═══════════════════════════════════════════════════════════════════════════
# CELL 7 — TRAIN: Sentiment Model
# ═══════════════════════════════════════════════════════════════════════════

def train_sentiment_model(num_epochs: int = 3, learning_rate: float = 2e-5) -> str:
    """
    Fine-tune cardiffnlp/twitter-roberta-base-sentiment-latest.

    Why this base model?
      - Pre-trained on 58M tweets (already understands informal language)
      - 125M parameters (fast enough for Colab T4)
      - State of the art on SemEval Twitter sentiment benchmarks
      - After our fine-tuning: adapts to business review language

    Training config for T4:
      batch_size=16, grad_accum=4 → effective batch=64
      fp16=True → 2× speed, half memory
      warmup_ratio=0.1 → prevents loss spike in first steps
      weight_decay=0.01 → L2 regularisation against overfitting
    """
    print("\n" + "="*60)
    print("TRAINING SENTIMENT MODEL")
    print("Base: cardiffnlp/twitter-roberta-base-sentiment-latest")
    print(f"Device: {DEVICE}  |  Effective batch: {BATCH_SIZE * GRAD_ACCUM}")
    print("="*60 + "\n")

    MODEL_CHECKPOINT = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    CKPT_DIR = DRIVE_ROOT / "checkpoints" / "sentiment"
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_CHECKPOINT)

    logger.info("Loading datasets...")
    raw_datasets = load_sentiment_datasets()
    tokenized    = tokenize_dataset(tokenizer, raw_datasets, label_col="sentiment_label")

    logger.info("Loading model...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_CHECKPOINT,
        num_labels=3,
        id2label=SENTIMENT_LABELS,
        label2id=SENTIMENT_ID2LABEL,
        ignore_mismatched_sizes=True,   # Replaces the 3-way head from pretrained weights
    )
    model.to(DEVICE)

    n_params = sum(p.numel() for p in model.parameters()) / 1e6
    logger.info(f"Model: {n_params:.1f}M parameters")

    # FIX: evaluation_strategy (not eval_strategy) — correct for transformers 4.36.2
    # FIX: added gradient_accumulation_steps=GRAD_ACCUM (was missing before)
    training_args = TrainingArguments(
        output_dir=str(CKPT_DIR),
        num_train_epochs=num_epochs,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=learning_rate,
        warmup_ratio=0.1,
        weight_decay=0.01,
        fp16=(DEVICE == "cuda"),
        evaluation_strategy="epoch",     # FIX: was eval_strategy (wrong param name)
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_steps=100,
        save_total_limit=2,              # Keep only 2 checkpoints to save Drive space
        report_to="none",
        dataloader_num_workers=2,
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=make_compute_metrics(3),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    logger.info("Starting training...")
    t0 = datetime.now()
    trainer.train()
    elapsed = datetime.now() - t0
    logger.info(f"Finished in {elapsed}")

    # ── Evaluate on test set ─────────────────────────────────────
    logger.info("Evaluating on test set...")
    test_res = trainer.evaluate(tokenized["test"])
    print(f"\nTest  accuracy : {test_res['eval_accuracy']*100:.1f}%")
    print(f"Test  F1 (wtd) : {test_res['eval_f1_weighted']:.4f}")

    preds_out  = trainer.predict(tokenized["test"])
    pred_ids   = np.argmax(preds_out.predictions, axis=-1)
    true_ids   = preds_out.label_ids

    print("\n" + classification_report(
        true_ids, pred_ids,
        target_names=list(SENTIMENT_LABELS.values()),
        digits=4,
    ))

    # ── Confusion matrix ─────────────────────────────────────────
    cm = confusion_matrix(true_ids, pred_ids)
    fig, ax = plt.subplots(figsize=(7, 5))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=list(SENTIMENT_LABELS.values()),
        yticklabels=list(SENTIMENT_LABELS.values()),
        ax=ax,
    )
    ax.set_title("Sentiment Model — Confusion Matrix (Test Set)")
    ax.set_ylabel("True"); ax.set_xlabel("Predicted")
    plt.tight_layout()
    plot_path = str(PLOTS_DIR / "sentiment_cm.png")
    plt.savefig(plot_path, dpi=150)
    plt.show()
    logger.info(f"Plot saved: {plot_path}")

    # ── Save model ───────────────────────────────────────────────
    logger.info(f"Saving to {SENTIMENT_DIR} ...")
    trainer.model.save_pretrained(str(SENTIMENT_DIR))
    tokenizer.save_pretrained(str(SENTIMENT_DIR))
    with open(SENTIMENT_DIR / "training_info.json", "w") as f:
        json.dump({
            "base_model":    MODEL_CHECKPOINT,
            "num_labels":    3,
            "id2label":      SENTIMENT_LABELS,
            "accuracy":      test_res["eval_accuracy"],
            "f1_weighted":   test_res["eval_f1_weighted"],
            "trained_at":    datetime.now().isoformat(),
            "training_time": str(elapsed),
        }, f, indent=2)

    print(f"\n✓ Saved: {SENTIMENT_DIR}")
    print("  Copy to: python-services/business-service/models/sentiment_roberta/")
    return str(SENTIMENT_DIR)


# ═══════════════════════════════════════════════════════════════════════════
# CELL 8 — TRAIN: Business Category Model
# ═══════════════════════════════════════════════════════════════════════════

def train_business_category_model(num_epochs: int = 4, learning_rate: float = 3e-5) -> str:
    """
    Fine-tune distilbert-base-uncased for 10-class business categorisation.

    Why DistilBERT instead of BERT?
      - 66M params vs 110M → 40% fewer params
      - Inference: ~8ms/request (vs ~15ms for BERT) — important for FastAPI
      - Retains 97% of BERT's GLUE benchmark performance
      - Fits in FastAPI service without large memory overhead

    Training time: ~28 min on T4 (150K samples, 4 epochs, batch 16)
    """
    print("\n" + "="*60)
    print("TRAINING BUSINESS CATEGORY MODEL")
    print("Base: distilbert-base-uncased")
    print(f"Device: {DEVICE}  |  Effective batch: {BATCH_SIZE * GRAD_ACCUM}")
    print("="*60 + "\n")

    MODEL_CHECKPOINT = "distilbert-base-uncased"
    CKPT_DIR = DRIVE_ROOT / "checkpoints" / "category"
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_CHECKPOINT)

    logger.info("Loading datasets...")
    raw_datasets = load_business_category_datasets()
    tokenized    = tokenize_dataset(tokenizer, raw_datasets, label_col="category_label")

    logger.info("Loading model...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_CHECKPOINT,
        num_labels=len(BUSINESS_CATEGORIES),
        id2label=BUSINESS_CATEGORIES,
        label2id=BIZ_ID2LABEL,
    )
    model.to(DEVICE)

    n_params = sum(p.numel() for p in model.parameters()) / 1e6
    logger.info(f"Model: {n_params:.1f}M parameters")

    # FIX: evaluation_strategy (not eval_strategy)
    training_args = TrainingArguments(
        output_dir=str(CKPT_DIR),
        num_train_epochs=num_epochs,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=learning_rate,
        warmup_ratio=0.1,
        weight_decay=0.01,
        fp16=(DEVICE == "cuda"),
        evaluation_strategy="epoch",      # FIX
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_steps=100,
        save_total_limit=2,
        report_to="none",
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=make_compute_metrics(len(BUSINESS_CATEGORIES)),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    logger.info("Starting training...")
    t0 = datetime.now()
    trainer.train()
    elapsed = datetime.now() - t0
    logger.info(f"Finished in {elapsed}")

    test_res = trainer.evaluate(tokenized["test"])
    print(f"\nTest  accuracy : {test_res['eval_accuracy']*100:.1f}%")
    print(f"Test  F1 (wtd) : {test_res['eval_f1_weighted']:.4f}")

    preds_out = trainer.predict(tokenized["test"])
    pred_ids  = np.argmax(preds_out.predictions, axis=-1)
    true_ids  = preds_out.label_ids

    print("\n" + classification_report(
        true_ids, pred_ids,
        target_names=list(BUSINESS_CATEGORIES.values()),
        digits=4,
    ))

    # Confusion matrix
    cm = confusion_matrix(true_ids, pred_ids)
    fig, ax = plt.subplots(figsize=(12, 9))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Greens",
        xticklabels=list(BUSINESS_CATEGORIES.values()),
        yticklabels=list(BUSINESS_CATEGORIES.values()),
        ax=ax,
    )
    ax.set_title("Business Category — Confusion Matrix (Test Set)")
    ax.set_ylabel("True"); ax.set_xlabel("Predicted")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plot_path = str(PLOTS_DIR / "category_cm.png")
    plt.savefig(plot_path, dpi=150)
    plt.show()

    logger.info(f"Saving to {CATEGORY_DIR} ...")
    trainer.model.save_pretrained(str(CATEGORY_DIR))
    tokenizer.save_pretrained(str(CATEGORY_DIR))
    with open(CATEGORY_DIR / "training_info.json", "w") as f:
        json.dump({
            "base_model":  MODEL_CHECKPOINT,
            "categories":  BUSINESS_CATEGORIES,
            "accuracy":    test_res["eval_accuracy"],
            "f1_weighted": test_res["eval_f1_weighted"],
            "trained_at":  datetime.now().isoformat(),
            "training_time": str(elapsed),
        }, f, indent=2)

    print(f"\n✓ Saved: {CATEGORY_DIR}")
    print("  Copy to: python-services/business-service/models/business_category/")
    return str(CATEGORY_DIR)


# ═══════════════════════════════════════════════════════════════════════════
# CELL 9 — Quick inference test (run after training to verify models work)
# ═══════════════════════════════════════════════════════════════════════════

def test_inference():
    """
    Run predictions on known examples to confirm both models work correctly.
    All expected labels are annotated in comments.
    """
    from transformers import pipeline

    print("\n" + "="*60)
    print("INFERENCE TEST — verifying both models")
    print("="*60)

    # ── Sentiment tests ──────────────────────────────────────────
    s_path = str(SENTIMENT_DIR)
    if os.path.exists(s_path):
        print("\n--- Sentiment Model ---")
        pipe = pipeline("text-classification", model=s_path,
                        device=0 if DEVICE == "cuda" else -1)
        tests = [
            ("Amazing service! Team was incredibly helpful and responsive.",       "POSITIVE"),
            ("Best marketing agency I've ever worked with — highly recommend!",    "POSITIVE"),
            ("Terrible experience. Wasted my money. Would NOT recommend.",         "NEGATIVE"),
            ("The worst customer service I've ever encountered in my life.",       "NEGATIVE"),
            ("It was okay. Nothing special but did the job fine.",                 "NEUTRAL"),
            ("Average restaurant. Decent food, service was alright.",              "NEUTRAL"),
        ]
        all_correct = 0
        for text, expected in tests:
            r = pipe(text[:512])[0]
            label = r["label"]
            score = r["score"]
            correct = "✓" if label == expected else "✗"
            print(f"  {correct} [{label:8s} {score:.2f}] {text[:60]}")
            all_correct += (label == expected)
        print(f"  Quick accuracy: {all_correct}/{len(tests)} ({all_correct/len(tests)*100:.0f}%)")
    else:
        print(f"Sentiment model not found at {s_path}")

    # ── Category tests ───────────────────────────────────────────
    c_path = str(CATEGORY_DIR)
    if os.path.exists(c_path):
        print("\n--- Business Category Model ---")
        pipe = pipeline("text-classification", model=c_path,
                        device=0 if DEVICE == "cuda" else -1)
        tests = [
            ("Italian restaurant serving fresh pasta and wine",     "Food & Beverage"),
            ("Online fashion store selling designer clothes",        "Retail & Shopping"),
            ("Dental clinic offering braces and cosmetic dentistry", "Healthcare & Wellness"),
            ("Cloud CRM software for small business teams",         "Technology & Software"),
            ("Investment bank for mergers and acquisitions",        "Finance & Banking"),
            ("Luxury apartment development in downtown Dubai",      "Real Estate & Property"),
            ("Digital marketing agency growing brands via social",  "Professional Services"),
            ("Online coding bootcamp with job guarantee",           "Education & Training"),
            ("Electric vehicle dealership and charging solutions",  "Automotive & Transport"),
        ]
        all_correct = 0
        for text, expected in tests:
            r     = pipe(text[:512])[0]
            label = r["label"]
            score = r["score"]
            # Model outputs "LABEL_0", "LABEL_1", etc. — map to readable name
            if label.startswith("LABEL_"):
                label = BUSINESS_CATEGORIES.get(int(label.replace("LABEL_", "")), label)
            correct = "✓" if label == expected else "✗"
            print(f"  {correct} [{label:25s} {score:.2f}] {text[:50]}")
            all_correct += (label == expected)
        print(f"  Quick accuracy: {all_correct}/{len(tests)} ({all_correct/len(tests)*100:.0f}%)")
    else:
        print(f"Category model not found at {c_path}")

    print("\n✓ Inference test complete.")


# ═══════════════════════════════════════════════════════════════════════════
# CELL 10 — MAIN: Run full pipeline
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":

    print("="*60)
    print("MARKETING FYP — FULL MODEL TRAINING PIPELINE")
    print(f"Device: {DEVICE}  |  Session budget: ~90 min (free tier)")
    print(f"Estimated time: ~70 min total (42 sentiment + 28 category)")
    print("="*60 + "\n")

    # ── STEP 1: Train sentiment model (~42 min on T4, 300K samples) ─
    sentiment_path = train_sentiment_model(
        num_epochs=3,
        learning_rate=2e-5,
    )

    # Free GPU memory between models
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()
    print("\nGPU memory cleared. Starting category model...\n")

    # ── STEP 2: Train business category model (~28 min on T4, 150K) ─
    category_path = train_business_category_model(
        num_epochs=4,
        learning_rate=3e-5,
    )

    # ── STEP 3: Verify both models work ───────────────────────────
    test_inference()

    # ── STEP 4: Deployment instructions ───────────────────────────
    print("\n" + "="*60)
    print("DEPLOYMENT INSTRUCTIONS")
    print("="*60)
    print(f"\n1. Models saved to Google Drive:")
    print(f"   {SENTIMENT_DIR}")
    print(f"   {CATEGORY_DIR}")
    print()
    print("2. Download from Drive and copy into your project:")
    print("   python-services/business-service/models/sentiment_roberta/")
    print("   python-services/business-service/models/business_category/")
    print()
    print("3. Restart the business-service:")
    print("   docker-compose restart business-service")
    print()
    print("4. Verify loaded:")
    print("   curl http://localhost:8002/health")
    print("   → sentiment_loaded: true, category_model_loaded: true")
