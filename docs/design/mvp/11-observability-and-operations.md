# MVP 11 — Observability, SLOs, runbooks, ops tooling

## 1. What we reuse

`docker-compose.yml` already runs Prometheus (`:9350`), Grafana (`:3000`), Alertmanager (`:9351`), node-exporter. Wire apps into this; in hosted prod use **Grafana Cloud** (free tier) or the same stack on the VPS.

## 2. Logging

- `nestjs-pino` JSON on api, billing, worker. Next.js: default + request id header.
- Fields: `level`, `time`, `service`, `requestId`, `userId?`, `organizationId?`, `method`, `path`, `status`, `latencyMs`, `msg`.
- `X-Request-Id` generated in a middleware if absent; pass to billing/worker.
- Never log tokens, passwords, Stripe payloads, Authorization headers.

## 3. Metrics (`prom-client`, `/metrics`)

| Metric | Labels | SLO relevance |
| --- | --- | --- |
| `http_request_duration_seconds` histogram | service, method, route, status | latency |
| `http_requests_total` | same | error rate |
| `booking_created_total` | status | product |
| `slot_query_duration_seconds` | stale | |
| `outbox_pending` gauge | | |
| `pgboss_failed_jobs` | name | |
| `stripe_webhook_total` | type, result | |
| `calendar_sync_errors_total` | provider | |
| `nodejs_*` / process defaults | | |

Scrape in `observability/prometheus/prometheus.yml`:

```yaml
- job_name: shedflow-api
  static_configs: [{ targets: ['host.docker.internal:3001'] }]
- job_name: shedflow-billing
  static_configs: [{ targets: ['host.docker.internal:3002'] }]
- job_name: shedflow-worker
  static_configs: [{ targets: ['host.docker.internal:3003'] }]
```

On Linux compose, use service names if apps join the `monitoring` network.

## 4. Tracing

OpenTelemetry Node SDK, auto HTTP + pg. `OTEL_EXPORTER_OTLP_ENDPOINT` to Grafana Tempo. `traceparent` propagated. Sampling: 100% in staging, 10% prod + always-on errors.

## 5. Errors

Sentry DSN per service. Release = git SHA. Ignore 4xx except 401 spikes.

## 6. SLIs / SLOs (MVP)

| SLI | SLO | Window |
| --- | --- | --- |
| Booking page availability (non-5xx on public slots + POST bookings) | 99.5% | 30 d |
| Slot query p95 | < 600 ms | 7 d |
| Booking create p95 | < 1 s | 7 d |
| Email send success (non-bounce) | 99% | 7 d |
| Stripe webhook processing success | 99.9% | 7 d |

Error budget: 99.5% → ~3.6 h/month. Freeze features if exhausted two weeks running (process, not code).

## 7. Alerts (`observability/prometheus/alerts/shedflow.yml`)

| Alert | Expr (intent) | Severity | For |
| --- | --- | --- | --- |
| ApiDown | `up{job="shedflow-api"} == 0` | page | 2m |
| High5xx | 5xx rate > 5% 5m | page | 5m |
| SlotLatency | p95 > 1s 10m | ticket | 10m |
| OutboxLag | `outbox_pending > 100` | ticket | 10m |
| FailedJobs | increase failed > 5 / 15m | ticket | 15m |
| Disk/Postgres | from node-exporter / provider | page | 5m |

Alertmanager: email the operator. PagerDuty optional.

Grafana dashboard: request rate, p95, 5xx, bookings/min, outbox, queue, Stripe, calendar errors. Provision JSON under `observability/grafana/provisioning/dashboards/`.

## 8. Runbooks (`docs/runbooks/`)

Each alert has a runbook file. Minimum contents: symptom, impact, debug commands, mitigation, escalate.

**BookingCreateFailing:** check Postgres, exclusion constraint errors in logs, Stripe status, Sentry. If DB CPU, scale. If constraint storms, look at duplicate client retries.

**OutboxLag:** worker up? `pgboss` schema? poison messages in `domain_events` FAILED; replay `UPDATE status='PENDING'`.

**StripeWebhookBehind:** Stripe dashboard → retry; verify secrets; `rawBody`.

**CalendarNeedsReauth:** user must reconnect; not an incident.

**RestoreDB:** see `12`.

## 9. Feature flags

`FLAGS` env (global) union `organization.settings.flags`. Helper `isEnabled(flag, org)`. Flags: `outlook_calendar`, `sms`, `embed_v2`. No Unleash.

## 10. Support tooling (minimal)

- `POST /v1/platform/impersonate` (platform admin email allowlist `PLATFORM_ADMINS`) issues a JWT with `impersonatingOrgId`; dashboard banner; every request audit-logged. Disable in prod until allowlist set.
- Read-only SQL via Prisma Studio locally; prod via provider console.
- No dedicated admin app in MVP.

## 11. Health

`/health` checks: Postgres `SELECT 1`, billing checks Stripe with a cached flag (not every request). Worker: pg-boss started. Compose Grafana healthcheck already exists — keep it.
