import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'boolean' ? value : !['false', '0', 'no', 'off', ''].includes(String(value).trim().toLowerCase());

const URL_OPTS = { require_tld: false, require_protocol: true } as const;

/**
 * Every environment variable the backend reads, in one place: its type, its
 * default, and whether boot should fail without it. ConfigModule runs this at
 * startup (see app.module.ts), so a missing secret or a malformed URL stops the
 * process with a readable message instead of surfacing later as an opaque
 * runtime error.
 *
 * Services read values through ConfigService.get('NAME') using these exact
 * names. Integrations that are optional (Twilio, Stripe, Resend, Google Places)
 * stay optional here: each degrades to a logged "not configured" state.
 *
 * See .env.example for what each variable is for.
 */
export class EnvironmentVariables {
  // ── Server ────────────────────────────────────────────────────────────────
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(65535)
  PORT = 3001;

  // ── Database ──────────────────────────────────────────────────────────────
  @IsString() @MinLength(1, { message: 'DATABASE_URL is required (a Postgres connection string)' })
  DATABASE_URL: string;

  /** Auto-create/alter tables from the entities. Convenient in dev; use migrations in production. */
  @Transform(toBool) @IsBoolean()
  DB_SYNCHRONIZE = true;

  /** TLS to Postgres. Neon requires it; turn off for a local plain Postgres. */
  @Transform(toBool) @IsBoolean()
  DB_SSL = true;

  @Transform(toBool) @IsBoolean()
  DB_LOGGING = false;

  // ── Redis ─────────────────────────────────────────────────────────────────
  @IsString()
  REDIS_HOST = 'localhost';

  @Transform(({ value }) => Number(value)) @IsInt()
  REDIS_PORT = 6379;

  // ── Auth ──────────────────────────────────────────────────────────────────
  @IsString()
  @MinLength(32, {
    message:
      'JWT_SECRET must be set to a random string of at least 32 characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  })
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN = '7d';

  /** Encrypts tenant phone-number credentials. Falls back to JWT_SECRET when empty. */
  @IsOptional() @IsString()
  CREDENTIALS_ENCRYPTION_KEY?: string;

  // ── Python AI services ────────────────────────────────────────────────────
  @IsUrl(URL_OPTS) STT_SERVICE_URL = 'http://localhost:8001';
  @IsUrl(URL_OPTS) TTS_SERVICE_URL = 'http://localhost:8001';
  @IsUrl(URL_OPTS) LEADS_SERVICE_URL = 'http://localhost:8002';
  @IsUrl(URL_OPTS) BUSINESS_SERVICE_URL = 'http://localhost:8003';
  @IsUrl(URL_OPTS) LLM_SERVICE_URL = 'http://localhost:8004';

  // ── Twilio (optional) ─────────────────────────────────────────────────────
  @IsOptional() @IsString() TWILIO_ACCOUNT_SID?: string;
  @IsOptional() @IsString() TWILIO_AUTH_TOKEN?: string;
  @IsOptional() @IsString() TWILIO_PHONE_NUMBER?: string;

  // ── Email (optional) ──────────────────────────────────────────────────────
  @IsOptional() @IsString() RESEND_API_KEY?: string;
  @IsString() EMAIL_FROM = 'noreply@example.com';

  // ── Billing (optional) ────────────────────────────────────────────────────
  @IsOptional() @IsString() STRIPE_SECRET_KEY?: string;
  @IsOptional() @IsString() STRIPE_WEBHOOK_SECRET?: string;
  @IsOptional() @IsString() STRIPE_PRICE_STARTER?: string;
  @IsOptional() @IsString() STRIPE_PRICE_PRO?: string;
  @IsOptional() @IsString() STRIPE_PRICE_AGENCY?: string;

  // ── Business search (optional) ────────────────────────────────────────────
  @IsOptional() @IsString() GOOGLE_PLACES_API_KEY?: string;

  // ── URLs ──────────────────────────────────────────────────────────────────
  /** Must be publicly reachable by Twilio (TwiML webhook + wss:// media stream). */
  @IsUrl(URL_OPTS) BASE_URL = 'http://localhost:3001';
  @IsUrl(URL_OPTS) FRONTEND_URL = 'http://localhost:3000';
  /** Extra CORS origins, comma-separated. */
  @IsOptional() @IsString() ALLOWED_ORIGINS?: string;
}

/** ConfigModule `validate` hook: applies defaults, coerces types, fails boot on errors. */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  // Empty strings in .env mean "unset", so the class defaults apply to them.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const env = plainToInstance(EnvironmentVariables, cleaned, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors.flatMap(e => Object.values(e.constraints ?? {})).map(m => `  - ${m}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\nSee nestjs-backend/.env.example.`);
  }
  // Keep unrelated variables (PATH, TZ, ...) visible through ConfigService too.
  return Object.assign({}, cleaned, env);
}
