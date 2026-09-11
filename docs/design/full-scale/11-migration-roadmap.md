# Full-scale 11 — Migration roadmap (MVP → Phase 2)

Do not start this until **product-market fit** and at least one of: 1k orgs, p95 slots > 400 ms, on-call pain from the monolith, or a second team.

## Stage A — Modular monolith hardening (still Phase 1 topology)

1. Enforce table ownership with CI grep / CODEOWNERS.
2. Outbox already required in MVP — keep it complete (no sync email).
3. Clock port, PaymentGateway, CalendarProvider ports — already.
4. OpenAPI published.

## Stage B — Extract worker & billing (MVP already does this)

If you shipped billing/worker as separate processes in MVP, you are here. If a solo-dev shortcut merged them into `apps/api`, extract now.

## Stage C — Read model for slots

1. Materialize `slots:{eventTypeId}:{date}` in Redis from Postgres.
2. Point public GET at Redis with PG fallback.
3. Measure p95.

## Stage D — Identity JWKS

1. Stand up JWKS in `apps/api` or tiny Identity service.
2. Billing verifies JWT via JWKS, drop shared secret.

## Stage E — Occupancy service

1. Dual-write gist exclusion **and** occupancy rows.
2. Read occupancy on conflict; compare.
3. Cut over; drop gist when equal for 14 days.

## Stage F — Kafka + CDC

1. Debezium on `domain_events` or replace with per-table CDC.
2. Move notification/webhook consumers off pg-boss polling.
3. Temporal for timers (expiry, reminders).

## Stage G — Database split

1. Dump billing tables → billing Postgres; api keeps reading via HTTP.
2. Repeat for notifications logs, etc.
3. Drop unused tables.

## Stage H — Kubernetes + second region

1. Wrap existing Dockerfiles.
2. CRDB for occupancy.
3. Org region map, gateway routing.
4. Game-day failover.

## Stage I — Product Phase 2 features

Group events, waitlists, template CMS, custom domains, OAuth apps, MFA — can interleave after C/D when they pay for themselves.

## Rollback philosophy

Each stage is independently rollbackable (dual-write windows). Never combine DB split with occupancy cutover in the same week.

## Mapping of MVP shortcuts → replacement

See `mvp/01-architecture.md` §9 table. That table is the checklist for this document; when every row is replaced, you are on Phase 2 architecture.
