# MVP 10 — Security and privacy

## 1. Transport & headers

- TLS 1.2+ at Cloudflare / load balancer. HTTP→HTTPS redirect.
- `helmet` on Nest apps: CSP on API is loose (JSON); Next.js sets CSP. Booking embed route allows `frame-ancestors *`; all other Next routes `frame-ancestors 'self'`.
- HSTS at edge.
- `CORS` as in `03`.
- Cookies: NextAuth defaults (`httpOnly`, `secure` in prod, `sameSite=lax`).

## 2. Encryption

| Data | At rest | In transit |
| --- | --- | --- |
| Postgres (Neon/Supabase/volume) | Provider AES-256 | TLS |
| OAuth tokens, webhook secrets | AES-256-GCM app envelope (`ENCRYPTION_KEY`) | TLS |
| Passwords | bcrypt cost 10 (exists) | — |
| API keys / refresh / action tokens | SHA-256 hashes only | — |
| Card data | **never stored** | Stripe |

GCM nonce 12 bytes random; ciphertext format `v1:nonce:tag:ct` base64.

## 3. Secrets

`.env` local (gitignored). Production: Fly/Railway secrets or Doppler. Rotate `JWT_SECRET` only with dual-verify window (not automated in MVP — document a 15 min dual-secret if needed). `ENCRYPTION_KEY` rotation: dual-key decrypt, not required at launch.

## 4. Appsec controls

- Global ValidationPipe whitelist (exists).
- Rate limits (`03`).
- `Idempotency-Key` on money/slot mutations.
- Internal HMAC (`03`).
- SSRF guard on webhooks (`09`).
- File uploads: **none** in MVP (logo is URL).
- SQL: Prisma only; raw SQL migrations reviewed; no string concat.
- Dependency scanning: `pnpm audit` in CI (warn, don't hard-fail until we pin).

WAF: Cloudflare managed rules + bot fight on `/auth` and `/v1/public/bookings`.

## 5. Auth hardening

- Refresh rotation + family revoke (`03`).
- Login lockout via rate limit (no extra user flag in MVP).
- JWT `exp` 15 m.
- Signed action tokens hashed, purpose-bound, expiry.

## 6. GDPR / privacy (MVP bar)

| Right | Implementation |
| --- | --- |
| Inform | Privacy policy URL in footer (static markdown page). |
| Access | `GET /v1/organizations/:orgId/customers/:id/export` OWNER/ADMIN — JSON of customer + bookings (redact payment ids ok to include). User: `GET /v1/me/export`. |
| Erasure | Customer: `DELETE .../customers/:id` anonymizes email to `deleted+{id}@invalid.invalid`, name “Deleted”, phone null, answers `{}`, **keeps booking time rows** for host calendar integrity. User: `DELETE /v1/me` disables memberships, anonymizes, revokes tokens. Org: OWNER delete soft-deletes org. |
| Consent | Booking form checkbox “I agree to privacy policy” required; store `metadata.privacyAcceptedAt`. |
| DPA | Manual PDF for Pro (ops, not code). |
| Subprocessors | Stripe, Resend, Neon/Supabase, Vercel, Google/Microsoft (calendar), Sentry. List in privacy page. |

Lawful basis: contract for bookings; legitimate interest for abuse logs.

`audit_logs` retain 1 year; purge job monthly.

Do not put invitee PII in client-side analytics. Sentry `sendDefaultPii: false`; scrub `Authorization`.

## 7. Audit log

Write on: login (success/fail hashed email), register, org settings, member role, refund, cancel/reschedule by host, API key create/revoke, impersonation. Actor + ip + userAgent + resource.

## 8. Multi-tenant

See `02` §8 and `03` §10. E2E IDOR suite is a launch blocker.

## 9. Threat notes (accepted)

- No RLS (Phase 2).
- Shared JWT secret (Phase 2 JWKS).
- Invitee is unauthenticated (token in email = bearer). HTTPS + hash at rest.
- Calendar tokens = full calendar access; scope documented in connect UI.
