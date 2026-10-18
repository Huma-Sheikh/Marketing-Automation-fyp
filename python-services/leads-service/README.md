# Leads Scraping + NER + Scoring Service

FastAPI service on port **8002**. Scrapes public profiles for leads, enriches them with a
fine-tuned DistilBERT NER model and scores them with an XGBoost regressor.

## After Training

Place the trained model files in `model/` (singular):
- `model/distilbert_ner_prod_v2/` — DistilBERT NER checkpoint folder
- `model/scorer/xgboost_scorer.joblib` — XGBoost lead scorer

Then rebuild:
```bash
docker-compose up -d --build leads-service
```

## Stub Mode

Without model files, `/extract` returns no entities and `/score` uses a weighted formula
(`"mode": "stub"`). With `SCRAPE_MODE=demo` (the default), `/scrape` returns labelled demo leads
(`isDemoData: true`) so you can test the full pipeline immediately.

## Code layout

```
main.py            entry point: loads models, builds FastAPI(), includes the router (uvicorn main:app)
scrapers.py        compatibility alias -> app/scrapers.py (same module object; used by test_scrapers.py)
app/config.py      every env var + constant (model paths, scrape mode, NER thresholds, scorer feature order)
app/schemas.py     Pydantic request models (ScrapeRequest, ScoreRequest, ExtractRequest)
app/models.py      model state + loading (eager at import)
app/scrapers.py    public-profile scrapers (LinkedIn, Twitter/Nitter, Facebook, Instagram)
app/leads.py       demo leads, NER enrichment, scoring, entity extraction (no FastAPI imports)
app/routes.py      thin HTTP handlers
app/errors.py      catch-all JSON 500 handler
```

## Environment variables

See `.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCRAPE_MODE` | `demo` | `live` enables real third-party scraping; anything else returns demo leads |
| `SCRAPE_TIMEOUT` | `12` | HTTP timeout (seconds) for live scraping requests |

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | – | `{status, ner_loaded, scorer_loaded, scrape_mode, supported_platforms}` |
| POST | `/scrape` | `{platform, query, max_results=100}` | `{leads, platform, query, mode: "live"\|"demo", supported_platforms}` |
| POST | `/score` | the 8 scorer features (unknown fields → 422) | `{score: 0-100, mode: "model"\|"stub"}` |
| POST | `/extract` | `{text}` | `{entities, mode}`; on NER error `{entities: [], error}` |

## Run & test

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8002
python -m pytest -q          # test_scrapers.py, fully offline
```
