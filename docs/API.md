# Backend API reference

All REST routes are served by `nestjs-backend` under the global prefix **`/api`**
(e.g. `http://localhost:3001/api/leads`, or `/api/leads` through nginx).

## Conventions

**Authentication.** Routes marked 🔒 need `Authorization: Bearer <token>`, the
token returned by `POST /api/auth/login` or `/register`. A missing or expired
token returns `401`. Every resource is scoped to the signed-in user: another
tenant's id returns `404`, never their data.

**Validation.** Request bodies are validated against a DTO class in each
module's `dto/` folder. Unknown properties are stripped silently, which is how
fields like `userId` or `ownerId` are kept out of client control. Path ids are
UUIDs, and a malformed id returns `400`.

**Errors.** Every error, whatever its source, has one shape
(`src/common/filters/all-exceptions.filter.ts`):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Enter a valid email address; Password must be at least 8 characters",
  "errors": ["Enter a valid email address", "Password must be at least 8 characters"],
  "path": "/api/auth/register",
  "timestamp": "2026-10-18T12:00:00.000Z"
}
```

`message` is always one human-readable string that is safe to show in the UI.
`errors` is present only when there were several messages. Unexpected failures
return a generic `500` and are logged with their stack trace on the server.

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | Liveness: `{ status: "ok", uptimeSeconds, timestamp }` |
| GET | `/ai/health` | 🔒 | Status of the four Python AI services |

## Auth: `modules/auth`

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password (8–128), businessName }` | `{ token, user }`, or `409` if the email is taken |
| POST | `/auth/login` | public | `{ email, password }` | `{ token, user }`, or `401` |
| GET | `/auth/me` | 🔒 | | The current user, without the password hash |

## Leads: `modules/leads`

| Method | Path | Auth | Body / query | Description |
|---|---|---|---|---|
| POST | `/leads/scrape` | 🔒 | `{ platform, query, maxResults? (1–500, default 100) }` | Scrape via leads-service, score, and save |
| GET | `/leads` | 🔒 | `?status=` (see `LEAD_STATUSES`) | List leads, optionally filtered |
| POST | `/leads/import` | 🔒 | `{ leads: [...] }` (max 5000) | Bulk import (e.g. from business search) |
| GET | `/leads/:id` | 🔒 | | One lead |
| PUT | `/leads/:id` | 🔒 | Any of the lead fields, plus `status` | Update |
| DELETE | `/leads/:id` | 🔒 | | Delete |

Lead statuses: `new, contacted, qualified, converted, rejected, not-interested,
callback, voicemail, no-answer, busy, failed, canceled`. The last seven are
written by the dialler from call outcomes.

## Business prospecting: `modules/business`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/business/regions` | 🔒 | | Region codes for the search form |
| POST | `/business/search` | 🔒 | `{ location, category, region_code?, radius_meters?, min_rating?, max_rating?, max_results? (≤60) }` | Search businesses (Google Places, or sample data without a key) |
| POST | `/business/opportunities` | 🔒 | Same as search | Search and rank by opportunity (review sentiment, category) |

## Campaigns: `modules/campaigns`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/campaigns` | 🔒 | `{ name, type: call\|email\|sms\|mixed, settings? }` | Create a draft |
| GET | `/campaigns` | 🔒 | | List, newest first |
| POST | `/campaigns/:id/start` | 🔒 | | Queue calls, emails and/or SMS for the target leads |
| POST | `/campaigns/:id/stop` | 🔒 | | Pause and drop this campaign's pending jobs |
| GET | `/campaigns/:id/stats` | 🔒 | | `{ campaign, activeCalls }` |
| DELETE | `/campaigns/:id` | 🔒 | | Delete |

`settings` is free-form JSON (`CampaignSettings` in `campaign.types.ts`):
`leadIds`, `phoneNumberId`, `greeting`, `maxConcurrentCalls`,
`callStartHour`/`callEndHour`, `company`, `emailSubject`, `emailTemplate`,
`smsTemplate`. Templates may use `{{firstName}}`, `{{lastName}}`, `{{company}}`
and, for email only, `{{jobTitle}}`. Without `leadIds` a campaign targets every
lead whose status is `new`.

## Phone numbers: `modules/phone-numbers`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/phone-numbers/catalogue` | 🔒 | | Carriers, connection types, and credential fields |
| GET | `/phone-numbers` | 🔒 | | The tenant's numbers (credentials never returned) |
| POST | `/phone-numbers` | 🔒 | `{ carrier, provider, number, label?, credentials? }` | Attach a number |
| PUT | `/phone-numbers/:id` | 🔒 | `{ number?, label?, credentials? }` | Update (the connection type is fixed) |
| DELETE | `/phone-numbers/:id` | 🔒 | | Remove |
| POST | `/phone-numbers/:id/verify` | 🔒 | | Check the credentials with the provider |
| POST | `/phone-numbers/:id/default` | 🔒 | | Make it the default caller number (must be verified) |

## Analytics: `modules/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics/dashboard` | 🔒 | Call, lead and campaign stats, plus AI service health |
| GET | `/analytics/campaigns/:id` | 🔒 | Per-campaign call outcomes |

## Billing: `modules/billing`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/billing/checkout` | 🔒 | `{ plan: starter\|professional\|agency }` | Stripe Checkout session URL |
| POST | `/billing/portal` | 🔒 | | Stripe customer-portal URL |
| GET | `/billing/subscription` | 🔒 | | `{ sub, limits }`: the subscription record (plan, status, calls this month) and its plan limits |
| POST | `/billing/webhook` | Stripe signature | raw Stripe event | Subscription lifecycle updates |

Without `STRIPE_SECRET_KEY`, checkout and portal return `503` with "Stripe is
not configured".

## White-label: `modules/whitelabel`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/whitelabel/branding?domain=` | public | | Branding for a custom domain, or the platform default |
| POST | `/whitelabel/agencies` | 🔒 | `{ agencyName, customDomain?, primaryColor?, logoUrl?, accentColor?, callerIdName?, supportEmail?, limits? }` | Create |
| GET | `/whitelabel/agencies` | 🔒 | | The tenant's agencies |
| PUT | `/whitelabel/agencies/:id` | 🔒 | Same fields, plus `status` | Update. `ownerId` and usage counters cannot be changed |
| DELETE | `/whitelabel/agencies/:id` | 🔒 | | Delete |

A custom domain that another agency already uses returns `409`.

## Telephony webhooks: `modules/calling`

These are called by Twilio and Vapi, not by the frontend.

| Method | Path | Description |
|---|---|---|
| POST | `/twiml/outbound?leadId=&campaignId=` | TwiML that connects the call to the media stream |
| POST | `/twiml/inbound` | TwiML for inbound calls |
| POST | `/twiml/status` | Twilio status callback; settles unanswered, busy and failed calls |
| POST | `/vapi/webhook` | Vapi Server URL events; checks the `x-vapi-secret` header |
| WS | `/audio-stream` (no `/api` prefix) | Twilio Media Streams: 8 kHz μ-law audio in both directions |

## Python services (internal)

The backend calls these over HTTP. Their URLs come from `*_SERVICE_URL` in
`nestjs-backend/.env`, and each service's README lists its routes.

| Service | Port | Used by |
|---|---|---|
| stt-tts-service | 8001 | `AiService.transcribeAudio`, `synthesizeSpeech` |
| leads-service | 8002 | `LeadsService.scrapeAndSave` |
| business-service | 8003 | `BusinessService` |
| llm-service | 8004 | `AiService.generateResponse`, `qualifyLead` |
