# AI Marketing Platform

Production-ready AI marketing automation platform.
- 60-70 concurrent AI voice calls
- Lead scraping from social platforms
- Email & SMS campaigns
- Real-time analytics
- White-label multi-tenant
- Stripe billing

## Setup

1. `cp nestjs-backend/.env.example nestjs-backend/.env` — fill in your keys
2. `cp nextjs-frontend/.env.local.example nextjs-frontend/.env.local`
3. `docker-compose up -d`
4. Open http://localhost:3000

## After Training Models (see Training Guide)

Drop trained model files into `python-services/*/models/`:
- stt-tts-service/models/ → stt_model_final.pth, tts_final.pth
- leads-service/models/ → ner_bert/ folder, lead_scorer.json
- business-service/models/ → sentiment_roberta/ folder
- llm-service/models/ → model-q4_K_M.gguf
