/**
 * Runtime configuration read from NEXT_PUBLIC_* environment variables.
 * Next.js inlines these at build time, so each one must be referenced by its
 * full literal name (no dynamic `process.env[key]` lookups).
 * See .env.local.example for the documented list.
 */

function toNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  /** Base URL of the NestJS API, including the /api prefix. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  /** How often the dashboard re-polls analytics, in milliseconds. */
  dashboardRefreshMs: toNumber(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS, 10000),
} as const;
