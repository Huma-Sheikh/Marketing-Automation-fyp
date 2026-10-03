# Leads Scraping + NER + Scoring Service

## After Training

Place your trained model files in the `models/` directory:
- `models/ner_bert/` — BERT NER model folder (from Kaggle output)
- `models/lead_scorer.json` — XGBoost model file

Then rebuild:
```bash
docker-compose up -d --build leads-service
```
To run locally 
uvicorn main:app --host 0.0.0.0 --port 8001,
## Stub Mode

Without model files, the service returns realistic demo leads so you can
test the full pipeline immediately.
