# AI Marketing Platform

AI marketing automation: outbound voice calls with a live speech pipeline, lead
scraping and scoring, business prospecting, email/SMS campaigns, analytics,
white-label multi-tenancy and Stripe billing.

## Architecture

```
nginx :80
  ├── /              → nextjs-frontend :3000
  ├── /api           → nestjs-backend  :3001
  └── /audio-stream  → nestjs-backend  :3001   (raw WebSocket — Twilio Media Streams)

nestjs-backend :3001
  ├── Postgres (Neon)        persistence
  ├── Redis + Bull           call / email / SMS queues
  └── python-services
        ├── stt-tts   :8001  Whisper STT + VITS TTS
        ├── leads     :8002  scraping, DistilBERT NER, XGBoost scoring
        ├── business  :8003  Google Places, RoBERTa sentiment, category model
        └── llm       :8004  conversation + lead qualification
```

## Setup

1. `cp nestjs-backend/.env.example nestjs-backend/.env` and fill it in.
   **`JWT_SECRET` is required** (32+ chars) — the backend refuses to start
   without it:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. `cp nextjs-frontend/.env.local.example nextjs-frontend/.env.local`
3. `docker-compose up -d --build`
4. Open http://localhost:3000

Everything runs without third-party keys. Twilio, Resend, Stripe and Google
Places each degrade to a clearly-logged disabled state rather than failing.

## Voice calls

Twilio must be able to reach this machine, so `BASE_URL` has to be a public
HTTPS address — in development, a tunnel:

```bash
ngrok http 3001
# then set BASE_URL=https://<your-id>.ngrok-free.app in nestjs-backend/.env
```

The call path is: Twilio dials → `POST /api/twiml/outbound` returns TwiML with a
`<Stream>` pointing at `wss://$BASE_URL/audio-stream` → Twilio opens a raw
WebSocket and streams 8 kHz μ-law audio → the backend buffers it into whole
utterances, transcribes, generates a reply, synthesises it, and streams it back
as 20 ms μ-law frames. Callers can interrupt the agent (barge-in).

### Caller numbers (Settings → Phone Numbers)

Each tenant attaches the numbers the agent calls from; a campaign can pin one,
otherwise the tenant's default is used, then the platform's `TWILIO_PHONE_NUMBER`.
Credentials are AES-256-GCM encrypted (`CREDENTIALS_ENCRYPTION_KEY`) and every
number is verified against its provider before it can dial.

| Connection | For | How the call is placed |
|---|---|---|
| Twilio number / verified caller ID | Twilio numbers; any Jazz, Zong, Telenor, Ufone or PTCL number verified in Twilio | Twilio carries the call and shows your number |
| Carrier SIP trunk / GSM gateway (BYOC) | A carrier business SIP trunk (PTCL, Jazz, Zong, …) or a GSM gateway holding the SIM; also Vonage, Telnyx, Plivo or any SIP carrier | Twilio routes out through your trunk (`byoc`), so the call uses your carrier and real number |
| Vapi | Numbers in a Vapi workspace | Vapi's assistant runs the call; `POST /api/vapi/webhook` records the transcript and qualifies the lead |

The first two keep audio on Twilio Media Streams, so the platform's own
STT → LLM → TTS agent handles the conversation unchanged.

## Models

Each Python service reads its own model directory. **Note the directory names
differ between services** — they match what each service's `main.py` loads:

| Service            | Directory                                  | Contents                                             |
| ------------------ | ------------------------------------------ | ---------------------------------------------------- |
| `stt-tts-service`  | `models/stt_model_final/`                  | Whisper checkpoint (multilingual)                     |
|                    | `models/tts_model_final/<lang>/`           | One VITS/MMS checkpoint per language                  |
| `leads-service`    | `model/distilbert_ner_prod_v2/`            | NER (PERSON / ORG / LOC)                              |
|                    | `model/scorer/xgboost_scorer.joblib`       | Lead scorer                                           |
| `business-service` | `model/sentiment_roberta/`                 | Review sentiment                                      |
|                    | `model/business_category/`                 | 10-way business category                              |
| `llm-service`      | `models/model-q4_K_M.gguf`                 | Quantised conversation model                          |

Train them with the notebooks in `python-services/ml-training/`. Model weights
are gitignored — every service starts in a documented stub mode when its
checkpoint is absent, and `GET /health` on each service reports what loaded.

## Lead scraping

`leads-service` defaults to `SCRAPE_MODE=demo`, which returns a labelled demo
dataset (`isDemoData: true`) so the pipeline is exercisable offline. Set
`SCRAPE_MODE=live` to scrape public profiles for real. Live scraping is subject
to each platform's terms of service and to local data-protection law; enabling
it is a deliberate operator decision.

## Tests

```bash
cd nestjs-backend && npm test                  # backend unit tests
cd python-services/leads-service && pytest     # scraper parsers
cd python-services/stt-tts-service && pytest   # STT/TTS service
```
