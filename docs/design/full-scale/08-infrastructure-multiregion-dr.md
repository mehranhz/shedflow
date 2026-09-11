# Full-scale 08 — Multi-region infrastructure and DR

## 1. Topology

- **Two (then three) regions** active-active for stateless services.
- **Org home region** for Booking/Entitlements writes (CRDB REGIONAL BY ROW).
- **Global anycast** edge (Cloudflare) for slots and SSR.
- Kafka MirrorMaker or a global bus; prefer **region-local Kafka** + async replicate events for notifications (lossy OK) vs occupancy (not via Kafka).

## 2. Failover

- Identity/Tenant: Postgres HA + replica promotion (RPO seconds) **or** CRDB.
- If home region dies: CRDB serves from surviving replicas; RPO ~0 for occupancy. RTO < 5 min including DNS/gateway weights.
- Stripe is global; webhooks dual-ingest with idempotency.

## 3. Deploy

GitOps (Argo CD), canary 1%→10%→50%→100%, auto-rollback on SLO burn. Migrations: expand in all regions, then code, then contract.

## 4. Backups

PITR all Postgres; CRDB backups hourly to GCS/S3 another region. Quarterly restore game day. RPO ~0 occupancy, ≤ 5 min others. RTO < 5 min region, < 1 h full platform rebuild from IaC.

## 5. Environments

`dev`, `staging` (single region), `prod`, `prod-dr` drill. Platform sandbox for developers.

## 6. Cost

Autoscale to zero on staging. Spot for workers. Slot cache is the cheap path — over-provision Redis before Booking CPU.
