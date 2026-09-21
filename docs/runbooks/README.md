# Runbooks

Operational playbooks for Phase 1. Alerts in `observability/prometheus/alerts/` should link here.

| Alert / situation | Runbook |
| --- | --- |
| API / billing / worker down (`ApiDown`, `BillingDown`, `WorkerDown`, `High5xx`) | [service-down.md](./service-down.md) |
| Booking create failures / slot latency | [booking-create-failing.md](./booking-create-failing.md) |
| Outbox / pg-boss lag (`OutboxLag`, `FailedJobs`) | [outbox-lag.md](./outbox-lag.md) |
| Stripe webhooks behind | [stripe-webhooks.md](./stripe-webhooks.md) |
| Calendar reconnect | [calendar-reauth.md](./calendar-reauth.md) |
| Database restore | [restore-db.md](./restore-db.md) |
| Provision prod (click-ops) | [provision.md](./provision.md) |

Alerts live in `observability/prometheus/alerts/shedflow.yml`. Grafana: http://localhost:3300 (Next stays on :3000).
