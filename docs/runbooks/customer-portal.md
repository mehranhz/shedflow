# Customer portal launch checklist (Wave 16 / T-082)

## Flags & env

| Item | Notes |
| --- | --- |
| `API_URL` / `AUTH_SECRET` / `JWT_SECRET` | Required (see `.env.example`) |
| Stripe test keys | Needed for portal payment visibility (T-061+) |
| `E2E_PORTAL=1` | Enables portal Playwright suite in CI/local |
| Feature flags | Portal engagement (waitlist, reviews, gift cards) may be flag-gated |

## Seed users

| Persona | Email | Password | Entry |
| --- | --- | --- | --- |
| Business owner | `owner@shedflow.dev` | `Password123!` | `/login` → `/dashboard` (org `acme`) |
| End customer | `customer@shedflow.dev` | `Password123!` | `/portal/login` (added by **T-044**) |

Until T-044 lands, portal E2E specs **skip** when the seed customer is missing.

## Mobile QA matrix

| Device / browser | Install PWA | Offline shell | Deep link from email |
| --- | --- | --- | --- |
| Chromium desktop | Manifest + SW under `/portal/` | `/portal/offline` | `/portal/appointments/:uid` |
| Android Chrome | Add to Home Screen | Same | Same |
| iOS Safari | Share → Add to Home Screen | Limited SW; offline page still routes | Same |

## Manual PWA checklist (T-078)

1. Open `/portal` in Chromium → Application → Manifest present.
2. Service worker scope is `/portal/` only (no SW on `/dashboard`).
3. DevTools → Network → Offline → reload `/portal` → offline fallback, not blank white.
4. Deep link: open `/portal/privacy` while installed as standalone.

## GDPR (T-077)

- `GET /v1/customer/export` — JSON (sync) or `202` async for large accounts.
- `DELETE /v1/customer/account` — requires `Idempotency-Key`; revokes refresh; anonymizes CRM rows.
- Staff `GET/DELETE /v1/me` and org customer export remain unchanged.

## Idempotency / rate limits (T-081)

See signed checklist in `tasks/wave-16-compliance-crm-pwa.md` §T-081.
