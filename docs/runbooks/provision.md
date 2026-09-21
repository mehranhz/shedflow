# Provision production (click-ops)

Complete Terraform is optional for launch (`docs/design/mvp/12-infrastructure-cicd-dr.md`).

1. **DNS / TLS / WAF:** Cloudflare zone `schedflow.com` — `app` (Vercel), `api`, `billing`.
2. **Postgres:** Neon project, PITR on, pooler URL for apps, direct URL for migrate job.
3. **Compute:** Fly or Railway — apps `api`, `billing`, `worker`. Secrets from `.env.example`.
4. **Client:** Vercel project `apps/client`; `API_URL`, `BILLING_URL`, `AUTH_SECRET`, `AUTH_URL`.
5. **Stripe:** platform account, Connect, two webhook endpoints (account + Connect), Pro prices, test then live.
6. **Google Cloud:** OAuth client, Calendar API, redirect `https://api…/v1/calendar/google/callback`.
7. **Resend:** domain `mail.schedflow.com`, `EMAIL_FROM`.
8. **Sentry + Grafana Cloud** DSNs/OTLP.
9. **Migrate job** before first boot: `prisma migrate deploy` with `DIRECT_DATABASE_URL`.
10. Counsel review of `/privacy` and `/terms` before taking money.

## Local seed (T-036)

```bash
cp .env.example .env
docker compose --profile core up -d postgres
pnpm install
pnpm db:migrate
pnpm --filter @shedflow/db seed   # or: pnpm db:seed
```

Demo login: `owner@shedflow.dev` / `Password123!` — org slug `acme`, events `intro` (free) and `coaching` ($150 seed price placeholders, not real Stripe).

## Docker images (build context = repo root)

```bash
docker build -f apps/api/Dockerfile .
docker build -f apps/billing/Dockerfile .
docker build -f apps/worker/Dockerfile .
docker build -f packages/db/Dockerfile.migrate .   # one-shot migrate
```

Deps stage uses `pnpm install --ignore-scripts` so Prisma generate runs after the full source tree is copied. Images are non-root and HEALTHCHECK `GET /health`.

Optional VPS stack: `docker compose -f docker-compose.prod.yml up -d --build` (run `migrate` service once first).

## CI

GitHub Actions workflow: `.github/workflows/ci.yml` (lint, unit, format check, API e2e with Postgres service, build).
