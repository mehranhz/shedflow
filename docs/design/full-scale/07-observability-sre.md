# Full-scale 07 — Observability and SRE

## 1. Pillars

- **Logs:** structured, sampled debug, PII scrubbers, 30 d hot / 1 y cold.
- **Metrics:** RED + USE, exemplars to traces.
- **Traces:** OTel, 100% of `/bookings` and `/slots`, 5–20% elsewhere.
- **Profiles:** Pyroscope/Grafana for hot booking paths.
- **Continuous profiling** on Booking service.

## 2. SLOs (binding)

| SLI | SLO |
| --- | --- |
| Booking command availability | 99.99% |
| Slot read availability | 99.99% |
| Slot p95 | 200 ms |
| Booking p95 | 300 ms |
| Webhook success < 1 min | 99.9% |
| Calendar sync freshness p95 | 30 s |

Multi-window burn-rate alerts (14.4× 1h and 6× 6h) page the on-call. Ticket on 3× 24h.

## 3. Dashboards

Service golden signals, occupancy DB, Kafka consumer lag, Temporal workflow failures, Stripe webhook age, cache hit ratio, region failover status.

## 4. Incident process

Sev1–4, Incident Commander, public status page (Statuspage). Error-budget policy: freeze non-SLO work if 28-day budget < 25%.

## 5. Runbooks

Every alert has a runbook and a game-day last-run date. Booking failover: divert org traffic to replica region (CRDB), freeze deploys, replay outbox.

## 6. Capacity

HPA on CPU/RPS/lag. Slot cache memory alerts. Load tests in CI weekly against staging (k6) gating release if p95 regresses > 10%.
