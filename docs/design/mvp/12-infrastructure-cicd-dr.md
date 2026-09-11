# MVP 12 — Infrastructure, CI/CD, environments, disaster recovery

## 1. Environments

| Name | Client | API/billing/worker | DB | Stripe | DNS |
| --- | --- | --- | --- | --- | --- |
| local | `:3000` | compose/node | compose Postgres `:5434` mapped | test | — |
| staging | Vercel preview | Fly/Railway staging | Neon branch | test | `staging.schedflow.com` |
| prod | Vercel | Fly/Railway prod | Neon primary PITR | live | `app.`, `api.`, `billing.` |

Local ports: Postgres host `5434` (see `docker-compose.yml`) — **`.env.example` currently says `5432`; T-001 must fix `DATABASE_URL` to `localhost:5434`.** API listens `3001` (hardcoded in `main.ts`); Grafana uses `3000` — client stays `3000`, Grafana already conflicts if both bind. **Move Grafana to `3300:3000` in compose** (T-035) so Next can use 3000.

## 2. Topology options (pick one at deploy time)

All three are supported by the same Dockerfiles.

**A. Vercel + Fly.io + Neon (recommended default)**  
Client/embed on Vercel. `apps/api`, `apps/billing`, `apps/worker` as Fly machines (1–2 each). Neon Postgres + PITR. Cloudflare in front of api/billing.

**B. Railway**  
Three services + Neon or Railway Postgres.

**C. Single VPS**  
`docker-compose.prod.yml` + Caddy (TLS). Daily `pg_dump` to object storage. Acceptable until 1k orgs.

No Kubernetes in MVP.

## 3. Containers

Each Nest app: multi-stage Dockerfile, dist + `node dist/main`, non-root, `PORT`. Healthcheck `GET /health`. Worker same with `main.worker.ts`. Migrations: a one-shot `packages/db` image `prisma migrate deploy` using `DIRECT_DATABASE_URL`.

## 4. CI (`/.github/workflows/ci.yml`)

On PR and main:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm test` (unit)
4. Postgres service container → `pnpm test:e2e` for api (+ billing/worker when they exist)
5. `pnpm build`
6. `pnpm format` check

Turbo remote cache optional. Node 22 (engines field). Prisma generate in api/db build.

CD: Vercel auto. Fly `fly deploy` on main after migrate job. Never migrate as a side effect of a booting server (race).

## 5. IaC

Small Terraform: Cloudflare zone, DNS, WAF. Fly apps via `fly.toml` per service. Secrets via `fly secrets`. Not blocking launch if done in dashboards — **document clicks in `docs/runbooks/provision.md`**.

## 6. HA (MVP)

- Postgres: Neon HA / provider. Local: single node.
- App: 2 Fly machines api in one region (`iad` or `lhr`). Billing 1–2. Worker **1** (pg-boss multiple workers ok later; start with 1 to keep job semantics obvious, then 2 with singleton keys).
- No multi-region.

## 7. Backups & DR

| | Target |
| --- | --- |
| RPO | 5 minutes (Neon PITR / provider WAL) |
| RTO | 4 hours |
| Backups | Provider PITR 7–14 days; weekly logical dump to R2/S3 |

**Restore drill** (staging, quarterly): create new Neon branch from PITR, point staging `DATABASE_URL`, `migrate deploy` (should be no-op), smoke login + book.

If VPS: `pg_dump -Fc` cron, `pg_restore` runbook.

App secrets backup: encrypted password manager, not git.

## 8. Rollback

Images tagged with git SHA. Fly `deploy --image`. Client: Vercel instant rollback. Migrations: expand/contract; if a bad migration applied, forward-fix. Never `migrate reset` in prod.

## 9. Config

Zod `env.ts` per service. `.env.example` at repo root lists **all** keys (update from `01` §7). `AUTH_SECRET` for NextAuth.

## 10. Local DX

```
pnpm install
cp .env.example .env
docker compose up -d postgres   # (split monitoring profile optional)
pnpm db:migrate
pnpm --filter @shedflow/db seed
pnpm dev   # turbo api + billing + worker + client
```

Compose profiles: `core` (postgres), `observability` (grafana…). Default `docker compose up -d` should **not** require Grafana for app dev — T-001 splits profiles.

## 11. Cost control

Staging sleeps on Fly (`auto_stop`). Stripe test. Sentry 5k errors.
