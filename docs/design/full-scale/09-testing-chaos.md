# Full-scale 09 — Testing and chaos

## 1. Test pyramid

- Unit + property tests for slot math and occupancy.
- Contract tests (Pact or Buf breaking-change) on every gRPC/JSON schema.
- Integration per service with testcontainers.
- E2E Playwright critical journeys against staging.
- Load: k6/locust, occupancy contention (same slot 1k VUs → one winner).
- **Chaos:** Chaos Mesh / Gremlin: kill pods, partition Kafka, 3s latency to Stripe, region blackhole. Weekly game day.
- Security: ZAP in CI, pentest cadence.

## 2. Booking correctness suite

A dedicated simulator: generate random schedules/DST/calendars, assert no overlapping CONFIRMED occupancy per host, credits never negative, webhook at-least-once.

## 3. Release quality gate

Cannot promote if: contract break, SLO burn in canary, flake rate > X, coverage drop on occupancy package.

## 4. From MVP

Keep Jest e2e double-book test **forever**. It is the crown jewel; port it to the occupancy service.
