# Full-scale 02 — Data, CQRS, sharding

## 1. Database per service

Each service owns one primary. No FK across services. Identifiers remain UUIDs (UUIDv7 for time-locality).

| Service | Primary | Replica / other |
| --- | --- | --- |
| Identity, Tenant, Catalog, Billing, Notification, Webhooks | Postgres 16 (Cloud SQL / RDS) regional HA | Read replicas |
| Booking occupancy | CockroachDB multi-region **or** Spanner | — |
| Scheduling read model | Postgres + Redis | Global Redis / KeyDB |
| Analytics | BigQuery | — |
| Search | OpenSearch | — |

## 2. CQRS

**Write:** Booking command service records occupancy:

```
Occupancy(host_id, tstzrange, booking_id, state HELD|CONFIRMED)
UNIQUE / exclusion equivalent under SERIALIZABLE
```

**Read:** Slot materializer consumes `occupancy.*`, `schedule.*`, `calendar.busy.*` and writes:

```
SlotCache key = {eventTypeId, yyyy-mm-dd, inviteeTz?} 
```

Actually invitee TZ is a **presentation** of host-grid UTC slots — cache UTC slots per event type + day:

```
Redis: slots:{eventTypeId}:{yyyy-mm-dd} = [{start,end}, ...]
TTL 24h + explicit invalidation
```

Slot HTTP handler: intersect cached UTC slots with invitee TZ formatting. p95 < 200 ms from edge Redis.

**Eventual consistency window:** after a booking, cache invalidation < 1 s in home region, < 3 s global. Slot GET may show a slot that 409s on POST — client retries next slot. This is the Calendly-class UX.

## 3. Sharding / partitioning

- **Org-keyed.** Tenant, billing, bookings partitioned or placed by `organization_id`. CRDB: `REGIONAL BY ROW` with `crdb_region` from org home region.
- Bookings table partitioned by month on `start_at` in regional Postgres if we do not use CRDB for history (history can live in Postgres, occupancy in CRDB).
- Kafka topics partitioned by `organizationId`.
- GDPR erasure: keyed delete by org/customer id across topics via Temporal workflow (fan-out).

## 4. Outbox & CDC

MVP `domain_events` polling is replaced by:

1. Transactional outbox table **in each service DB**.
2. Debezium connector → Kafka topic `*.events`.
3. Schema Registry (Avro/JSON Schema) with BACKWARD compatibility.
4. Consumers: notification, webhooks, search, slot materializer, warehouse.

Relay process from MVP can stay as fallback if CDC lags.

## 5. Migrations

- Per-service schema repo or folder. Atlas/Liquibase/Prisma still OK per service.
- Expand/contract mandatory. Online schema changes (gh-ost / native).
- Dual-write during occupancy move from Postgres gist → CRDB (see `11`).

## 6. Consistency choices

| Decision | Model |
| --- | --- |
| No double occupancy | Strong, home region |
| Credits | Strong per (org, customer) |
| Slot list | Eventual < 3 s |
| Search | Eventual < 10 s |
| Webhooks | At-least-once, ordered per org partition |

## 7. Data retention

| Data | Hot | Warm | Delete |
| --- | --- | --- | --- |
| Bookings | 18 months | object-store dump | tenant policy |
| Audit | 1 year hot | 7 years cold | |
| Outbox | 7 days | | |
| Notification log | 90 days | | |
| Stripe mirrors | life of tenant | | |

## 8. Migration from MVP schema

1. Keep UUID PKs.
2. Split Prisma schema by ownership comments already in `mvp/02`.
3. Replace cross-service Prisma relations with IDs only (already).
4. Move gist exclusion → occupancy service; keep gist in place until dual-write proven.
