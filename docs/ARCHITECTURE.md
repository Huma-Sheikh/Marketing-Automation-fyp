# Architecture

## System

```
browser ──► nginx :80
             ├── /              → nextjs-frontend  :3000
             ├── /api           → nestjs-backend   :3001
             └── /audio-stream  → nestjs-backend   :3001  (raw WebSocket, Twilio Media Streams)

nestjs-backend
  ├── Postgres (Neon)   users, leads, campaigns, calls, phone numbers, subscriptions, agencies
  ├── Redis + Bull      calling / email / sms queues
  ├── Twilio, Vapi      outbound calls, SMS
  ├── Resend, Stripe    email, billing
  └── python-services (HTTP, internal only)
        stt-tts-service   :8001  Whisper STT, MMS/VITS TTS
        leads-service     :8002  profile scraping, NER, XGBoost lead scoring
        business-service  :8003  Google Places, review sentiment, category classifier
        llm-service       :8004  sales conversation + lead qualification (GGUF)
```

The frontend talks only to `nestjs-backend`. The Python services are never
exposed to the browser.

## Repository layout

```
.
├── docker-compose.yml        all services; .env.example lists the variables it substitutes
├── nginx/                    reverse proxy config
├── docs/                     this file and API.md
├── nestjs-backend/           API, queues, voice pipeline; see nestjs-backend/README.md
├── nextjs-frontend/          Next.js 14 app router UI
└── python-services/
    ├── stt-tts-service/      ┐
    ├── leads-service/        │  each one: main.py (entry) + app/ package,
    ├── business-service/     │  .env.example, README.md
    ├── llm-service/          ┘
    └── ml-training/          Colab notebooks/scripts that produce the model checkpoints
```

## Backend (`nestjs-backend/src`)

Feature modules live in `modules/<feature>/`. In each one the controller
handles HTTP, the service holds the logic, `dto/` defines the inputs, and
`*.constants.ts` / `*.types.ts` hold shared values. Code that isn't tied to a
feature lives in `common/`, environment handling in `config/`, and the
TypeORM setup and entities in `database/`. See
[nestjs-backend/README.md](../nestjs-backend/README.md) for the conventions and
[API.md](API.md) for every route.

Cross-cutting behaviour:

| Concern | Where |
|---|---|
| Env validation and defaults | `config/env.validation.ts`, run by `ConfigModule` at boot |
| Input validation | Global `ValidationPipe` (`whitelist`, `transform`) + per-module DTOs |
| Error shape | `common/filters/all-exceptions.filter.ts` |
| Auth | `modules/auth`: JWT strategy + `JwtAuthGuard`; `@CurrentUser()` reads the caller |
| Tenancy | Every service query filters by `userId` / `ownerId` |

### Campaign flow

1. `POST /campaigns/:id/start` resolves the target leads (`settings.leadIds`,
   or every lead with status `new`).
2. Depending on the campaign type, it adds jobs to the `calling`, `email` and
   `sms` Bull queues (`modules/queue/queue.constants.ts` sets names, retries
   and rate limits).
3. `CallingQueueProcessor` checks the calling window, the plan quota and the
   concurrency ceiling, then calls `CallingService.initiateCall`.
   `EmailQueueProcessor` and `SmsQueueProcessor` send through Resend and Twilio.
4. Stopping a campaign removes only that campaign's pending jobs. The queues
   are shared by every tenant.

### Live call flow

Twilio dials the lead → `POST /api/twiml/outbound` returns TwiML with a
`<Stream>` → Twilio opens `wss://BASE_URL/audio-stream` → for each caller
turn, `TwilioMediaStreamServer` buffers 8 kHz μ-law audio into an utterance
and `CallingService.handleUtterance` runs STT (stt-tts-service), then a reply
(llm-service), then TTS, and streams 20 ms μ-law frames back. The caller can
interrupt the agent (barge-in). When the call ends, llm-service qualifies the
transcript and the lead's status is updated. Calls on Vapi numbers skip the
media stream: Vapi runs the conversation and reports to
`POST /api/vapi/webhook`.

## Frontend (`nextjs-frontend/src`)

```
src/
├── app/                    routes only (thin pages)
│   ├── (auth)/             login, register: no sidebar
│   ├── (app)/              every signed-in page; layout.tsx = auth guard + Sidebar
│   └── billing/success/    Stripe return page; signed-in only (RequireAuth), no sidebar
├── features/<feature>/     api.ts (endpoints), types.ts, constants.ts, hooks/, components/
├── components/ui/          shared presentational pieces (Button, Card, Alert, Badge, Spinner, ...)
├── components/layout/      Sidebar
├── providers/              AuthProvider (session), ToastProvider (notifications)
├── hooks/                  generic hooks
└── lib/                    config.ts (env), http.ts (fetch client), tokenStorage.ts
```

- **State.** The session and notifications are global React contexts.
  Everything else is feature state owned by a hook (`useLeads`,
  `useCampaignWizard`, ...), which exposes data, `loading`, `error` and actions.
  Pages compose those hooks with presentational components.
- **HTTP.** `lib/http.ts` adds the base URL and bearer token and parses the
  backend's error body into a typed `ApiError` whose `message` can be shown as
  is. A 401 on an authenticated request clears the session and redirects to
  `/login`.
- **Config.** `lib/config.ts` reads the `NEXT_PUBLIC_*` variables documented in
  `.env.local.example`.

## Python services

Every service has the same shape:

```
main.py          creates the FastAPI app, loads models, mounts the router (uvicorn main:app)
app/config.py    every env var, with its default
app/schemas.py   Pydantic request/response models
app/models.py    model loading and state
app/routes.py    APIRouter with thin handlers
app/errors.py    JSON 500 handler for unexpected exceptions
app/<logic>.py   the domain logic, which doesn't import FastAPI
```

When a model checkpoint is missing, each service falls back to a documented
stub or keyword mode, and `GET /health` reports what loaded. Model locations:

| Service | Directory |
|---|---|
| stt-tts-service | `models/stt_model_final/`, `models/tts_model_final/<lang>/`, `models/tts_model_base/<lang>/` |
| leads-service | `model/distilbert_ner_prod_v2/`, `model/scorer/xgboost_scorer.joblib` |
| business-service | `model/sentiment_roberta/`, `model/business_category/` |
| llm-service | `models/model-q4_K_M.gguf` |

## Configuration

| File | Read by |
|---|---|
| `.env` (from `.env.example`) | docker-compose variable substitution |
| `nestjs-backend/.env` | backend; validated by `src/config/env.validation.ts` |
| `nextjs-frontend/.env.local` | frontend (`NEXT_PUBLIC_*` only) |
| `python-services/<svc>/.env.example` | documents each service's variables (set them through docker-compose `environment:`) |

Inside docker-compose, the backend reaches Redis and the Python services by
their service names. `docker-compose.yml` sets those URLs and overrides
whatever `.env` contains.
