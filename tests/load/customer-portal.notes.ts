/**
 * Optional k6 notes for portal claim + book (T-081).
 *
 * Full scripts live under `tests/load/` when claim/book APIs (T-041/T-043) land.
 *
 * Suggested scenarios:
 * 1. POST /v1/customer/auth/claim — 10 VUs, assert 204 + rate-limit 429 envelope
 * 2. POST /v1/customer/bookings — with Idempotency-Key, assert SLOT_UNAVAILABLE / CONFLICT codes
 *
 * Run (when APIs exist):
 *   k6 run -e BASE_URL=http://localhost:3001 tests/load/customer-portal.js
 */
export const PORTAL_LOAD_NOTES = {
  claimRateLimit: "mirror auth login throttle (5–10 / 15m)",
  bookIdempotency: "Idempotency-Key required",
  conflictCodes: ["SLOT_UNAVAILABLE", "CONFLICT", "OUTSIDE_POLICY"],
} as const;
