# Business Scraper + Sentiment Service

FastAPI service on port **8003**. Finds businesses through the Google Places API, analyses their
reviews with a fine-tuned RoBERTa sentiment model and classifies them into 10 business
categories with a fine-tuned DistilBERT model.

## Models

Checkpoints from `ml-training/colab_02_sentiment_training.py` live in `model/` (override with
`MODELS_DIR`):
- `model/sentiment_roberta/` — sentiment classifier (NEGATIVE / NEUTRAL / POSITIVE)
- `model/business_category/` — category classifier; its `training_info.json` supplies the labels

Without them, sentiment falls back to the star rating and category to the Google Places `types`
mapping (default `Professional Services`). Without `GOOGLE_PLACES_API_KEY`, `/search` and
`/find-opportunities` return demo businesses.

## Code layout

```
main.py                entry point: loads models, builds FastAPI(), includes the router (uvicorn main:app)
app/config.py          every env var + constant (model paths, Places URLs/fields, limits)
app/reference_data.py  regions, default category labels, Places-type map, stub phone prefixes, opportunity text
app/schemas.py         Pydantic request models (SearchRequest, AnalyzeRequest)
app/models.py          model state + loading (eager at import)
app/classification.py  sentiment + category classification with fallbacks
app/places.py          Google Places client + stub business generator
app/business.py        search / find-opportunities / analyze use cases (no FastAPI imports)
app/routes.py          thin HTTP handlers
app/errors.py          catch-all JSON 500 handler
```

## Environment variables

See `.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODELS_DIR` | `model` | Directory containing the two checkpoints |
| `GOOGLE_PLACES_API_KEY` | `""` | Google Places key; empty = demo data |
| `CATEGORY_MIN_CONFIDENCE` | `0.75` | Min classifier score before its category is trusted |

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | – | `{status, sentiment_loaded, category_model_loaded, google_api, available_regions, business_categories}` |
| GET | `/regions` | – | `{regions: [{code, label}]}` |
| POST | `/search` | `{location, category, region_code?, radius_meters=25000, min_rating?, max_rating?, max_results=20}` | `{businesses, location, category, region_code, total}` |
| POST | `/find-opportunities` | same as `/search` (defaults `max_rating=3.5`, `min_rating=1.0`) | as `/search`, sorted worst-rated first, plus `outreach_script` and `contact_info` per business |
| POST | `/analyze` | `{texts: [str], include_category=true}` (first 200 used) | `{results: [{text, sentiment, score, category, opportunity}], total}` |

Google Places failures are logged and fall back to demo data rather than failing the request.

## Run & test

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8003
```

There is no test suite yet. `from app import classification, places, business` imports the
logic without the routes; importing `main` loads both checkpoints (~750 MB).
