/** @type {import("next").NextConfig} */
// The browser talks to the backend directly via NEXT_PUBLIC_API_URL (see
// lib/api.ts). There used to be an unused /api-proxy rewrite here; it was never
// referenced by any caller, so it has been removed rather than left as a
// second, untested path to the same API.
const nextConfig = {
  reactStrictMode: true,
};
module.exports = nextConfig;
