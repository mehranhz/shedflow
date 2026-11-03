# Customer portal launch checklist (Wave 16 / T-082)

## Flags & env

| Item | Notes |
| --- | --- |
| `API_URL` / `AUTH_SECRET` / `JWT_SECRET` | Required (see `.env.example`) |
| `CUSTOMER_PORTAL` / `NEXT_PUBLIC_CUSTOMER_PORTAL` | Portal deep links in emails (default on in local) |
| `FRONTEND_APP_URL` | Base for `/portal/appointments/{uid}` and manage links |
| `E2E_PORTAL=1` | Enables portal Playwright suite in CI/local |
| Feature flags | Portal engagement (waitlist, reviews) may be flag-gated; **no Stripe** guest checkout |

## Seed users

| Persona | Email | Password | Entry |
| --- | --- | --- | --- |
| Business owner | `owner@shedflow.dev` | `Password123!` | `/login` → `/dashboard` (org `acme`) |
| End customer | `customer@shedflow.dev` | `Password123!` | `/portal/login` (T-044) |

## Deep-link contract (Wave 10 / T-048)

HTTPS only (future native apps reuse the same paths):

| Intent | URL |
| --- | --- |
| Portal appointment | `{FRONTEND_APP_URL}/portal/appointments/{uid}` |
| Guest manage (signed) | `{FRONTEND_APP_URL}/b/{uid}/manage?token={manage}` |
| Receipt upload | `{FRONTEND_APP_URL}/b/{uid}/pay?token={manage}` |
| Claim | `{FRONTEND_APP_URL}/portal/claim?token=` or `?email=` |
| Register upgrade | `{FRONTEND_APP_URL}/portal/register?email=&next=` |

Confirmed invitee emails use **Manage in SchedFlow** (portal) as primary CTA when `customer_portal` is on, plus secondary signed manage link.

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
