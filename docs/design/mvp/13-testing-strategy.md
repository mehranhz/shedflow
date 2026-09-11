# MVP 13 — Testing strategy

## 1. Layers

| Layer | Where | Tools | When |
| --- | --- | --- | --- |
| Unit | `*.spec.ts` beside code | Jest (api/billing/worker), Vitest optional for client | every PR |
| Contract | `packages/shared` | zod parse of fixtures; DTO vs zod snapshot | PR |
| Integration | Nest testing module + test DB | Jest e2e | PR |
| E2E UI | Playwright | `apps/client` | PR (smoke) + nightly full |
| Load | k6 script `tests/load/slots.js` | staging, pre-launch | manual |
| Chaos | not in MVP | Phase 2 | |

Existing: api unit + e2e with `TEST_DATABASE_URL`, `InMemoryRepository`. **Keep that pattern.** New modules: domain services unit-tested with in-memory repos; exclusion constraint **must** be an e2e against Postgres.

## 2. Must-have tests (launch blockers)

1. Concurrent double-book (two `POST /v1/public/bookings` same slot) → 201 + 409.
2. Slot DST spring-forward / fall-back (`04` §10).
3. Paid booking: fake PaymentGateway, webhook fixture → CONFIRMED; expire without webhook → EXPIRED; webhook after expire → revive.
4. Credit consume race (two bookings, one credit) → one success.
5. IDOR: org A JWT cannot read org B booking UUID.
6. Idempotency replay and mismatch.
7. Refresh token reuse → family revoke.
8. Webhook SSRF: `http://127.0.0.1` rejected.
9. Register → org + default schedule → create event type → list slots → book free → cancel.
10. Playwright: login, onboarding to copy link, public book.

## 3. Conventions

- No real Stripe/Google/Resend in CI. Fake ports.
- E2e `globalSetup` migrate deploy (exists). Truncate tables or `TRUNCATE … CASCADE` per test file; disable FK checks not needed if truncate cascade.
- Time: inject `Clock` port (`now()`), default `new Date()`. Tests freeze time.
- Timezones: explicit `America/New_York`, `Europe/Berlin`, `Asia/Kolkata`, `Pacific/Auckland`.

## 4. Client

Not much test infra yet. Add Playwright in T-037. Component tests optional. Typecheck `pnpm --filter client build` is the client gate until Playwright lands.

## 5. Coverage

Do not enforce a %. Critical engines (availability, booking txn, credits, idempotency) should be obviously covered. Reviewer checks the list in §2.

## 6. Load (pre-launch)

k6: 50 VUs GET slots 5 min, p95 < 600 ms on staging with 1k bookings seeded. 20 VUs POST bookings unique slots. Not in CI.
