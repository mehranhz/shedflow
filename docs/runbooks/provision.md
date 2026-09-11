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
10. Counsel review of `/legal/privacy` and `/legal/terms` before taking money.
