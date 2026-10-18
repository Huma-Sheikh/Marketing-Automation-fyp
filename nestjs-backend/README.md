# nestjs-backend

The REST API, campaign queues and live voice-call pipeline. NestJS 10, TypeORM
(Postgres), Bull (Redis).

## Run

```bash
cp .env.example .env        # then set DATABASE_URL and JWT_SECRET at minimum
npm install
npm run start:dev           # http://localhost:3001/api
npm test                    # unit tests
npm run test:e2e            # HTTP-level tests (in-memory repositories, no DB needed)
```

The app checks its environment at startup (`src/config/env.validation.ts`) and
exits with a list of problems if a required variable is missing or malformed.

## Layout

```
src/
├── main.ts                 bootstrap: body parsers, CORS, global pipe + filter, /api prefix
├── app.module.ts           wires config, database, Redis and every feature module
├── config/
│   └── env.validation.ts   every env var: type, default, required or optional
├── database/
│   ├── database.module.ts  TypeORM connection, configured from env
│   └── entities/           User, Lead, Campaign, Call, PhoneNumber, Subscription, Agency
├── common/                 cross-cutting code with no feature knowledge
│   ├── decorators/         @CurrentUser()
│   ├── filters/            AllExceptionsFilter: the one error shape
│   ├── interfaces/         AuthenticatedUser
│   └── utils/              renderTemplate, escapeHtml/escapeXml, safeEqual
└── modules/<feature>/
    ├── <feature>.module.ts
    ├── <feature>.controller.ts   HTTP only: validate, read the user, call the service
    ├── <feature>.service.ts      business logic and persistence
    ├── <feature>.constants.ts    / *.types.ts: values and types the feature shares
    ├── dto/                      request bodies and queries (class-validator)
    └── <feature>.service.spec.ts
```

| Module | Responsibility |
|---|---|
| `auth` | Register, log in, JWT strategy and guard |
| `leads` | Scrape (via leads-service), score, import, CRUD |
| `business` | Business search and opportunity ranking (via business-service) |
| `campaigns` | Campaign CRUD; start fans leads out to the queues |
| `queue` | Bull queues and processors: dial, email, SMS. Names, retry policy and rate limits live in `queue.constants.ts` |
| `calling` | Places calls (Twilio, BYOC trunk, Vapi), runs the live STT → LLM → TTS conversation on the media stream, records outcomes |
| `phone-numbers` | Tenant caller numbers: encrypted credentials, provider verification, dial routing |
| `ai` | HTTP client for the Python STT/TTS and LLM services |
| `email` / `sms` | Resend and Twilio senders used by the outreach processors |
| `analytics` | Dashboard and per-campaign statistics |
| `billing` | Stripe checkout, portal, webhook; plan limits |
| `whitelabel` | Agencies with custom domain and branding |
| `health` | `GET /api/health` liveness probe |

## Conventions

- **Controllers stay thin.** They validate the input with a DTO, read the
  caller with `@CurrentUser('id')`, and pass both to one service method. Path
  ids go through `ParseUUIDPipe`.
- **Tenancy.** Every query on tenant data filters by `userId` (or `ownerId`).
  A record that belongs to someone else returns `404`.
- **DTOs are the writable surface.** The global `ValidationPipe` runs with
  `whitelist: true`, so a property that isn't on the DTO never reaches a
  service. Keep ownership and counter fields off DTOs.
- **Errors.** Throw Nest `HttpException`s (`NotFoundException`,
  `BadRequestException`, ...) with a message a user can read. The global filter
  formats them; anything else becomes a logged generic 500.
- **Configuration.** Read settings through `ConfigService`, never through
  `process.env`. When you add a variable, declare it in `env.validation.ts` and
  document it in `.env.example`.
- **Naming.** Files are `kebab-case.<kind>.ts`. Modules and classes use the
  plural feature name (`CampaignsService`). Shared literals (queue names, job
  names, statuses, defaults) go in `*.constants.ts`.

See [../docs/API.md](../docs/API.md) for every route and
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for how the services fit
together.
