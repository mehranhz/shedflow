# Restore database

**RPO 5 min / RTO 4 h** (`docs/design/mvp/12-infrastructure-cicd-dr.md`).

## Neon / Supabase

1. PITR branch to time T.
2. Point staging `DATABASE_URL` at it; `pnpm db:migrate:deploy` (no-op if schema matched).
3. Smoke: login, list slots, create booking.
4. Prod: promote per provider docs; update Fly/Railway secrets; bounce api/billing/worker.

## VPS pg_dump

1. `pg_restore` into a new database.
2. Swap `DATABASE_URL`; bounce.
3. Never `prisma migrate reset` in production.
