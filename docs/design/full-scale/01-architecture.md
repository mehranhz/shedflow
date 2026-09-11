# Full-scale 01 — Architecture (Phase 2)

Target: **99.99%** booking-path availability, **p95 < 200 ms** slot query, **p95 < 300 ms** booking create, multi-region **active-active**, PCI SAQ A with Level-1-merchant *obligations discharged to Stripe*, SOC 2 Type II.

This phase **evolves** the MVP seams in `mvp/01-architecture.md` §9. It does not rewrite the product.

## 1. Principles

1. **Database per service.** No shared Postgres. Cross-service data via events + explicit APIs.
2. **CQRS.** Writes go to the source of truth; slot queries hit a precomputed read model.
3. **Event-driven default.** Sync HTTP only for user-waiting commands that must return a result in one round (create booking still a command to Booking service; side effects async).
4. **Region stickiness by organization** plus global edge for public reads. A booking is serialized in the org's home region; the read model is replicated globally.
5. **Idempotency everywhere**, transactional outbox + CDC (Debezium) into Kafka.
6. **Zero-downtime:** expand/contract schema, blue/green or canary, feature flags (OpenFeature).

## 2. Service map

```
                    ┌──────────── Cloudflare / Envoy Gateway ────────────┐
                    │ WAF, mTLS mesh, authn JWT/JWKS, rate limit, routing │
                    └────────┬──────────────┬──────────────┬─────────────┘
           Next.js edge      │              │              │
           (app, booking)    │              │              │
                             ▼              ▼              ▼
                     Identity svc     Scheduling svc    Booking cmd svc
                     Org/Tenant svc   Calendar sync     Billing/Ledger
                     Entitlements     Notification      Webhook dispatcher
                     Feature flags    Search            Analytics ingest
```

| Service | Responsibility | Store | Notes |
| --- | --- | --- | --- |
| **Gateway** | Authn, tenancy header injection, routing, rate limit, schema validation | Redis (quotas) | Envoy + ext_authz → Identity |
| **Identity** | Users, sessions, MFA, API keys, JWKS, impersonation | Postgres | OIDC provider for first-party apps |
| **Tenant** | Organizations, members, RBAC policies, branding | Postgres | |
| **Scheduling** | Event types, schedules, slot **read model** builder | Postgres + Redis | Consumes booking/calendar events |
| **Calendar sync** | OAuth, incremental sync, provider adapters | Postgres (tokens in KMS) | |
| **Booking** | Commands: create/cancel/reschedule; occupancy ledger | **CockroachDB** or **Spanner** | Serializable occupancy |
| **Catalog** | Products/prices | Postgres | |
| **Billing** | Stripe Connect, webhooks, invoices mirror | Postgres | |
| **Entitlements / credits** | Ledger with strong consistency | CRDB/Spanner or Postgres+SERIALIZABLE | |
| **Notification** | Templates CMS, email/SMS/push, preferences | Postgres + object store | |
| **Webhook dispatcher** | Delivery, retries, SSRF, signing | Postgres + Kafka | |
| **Search** | Customers, bookings | OpenSearch | |
| **Analytics** | Warehouse sink | BigQuery/Snowflake | |
| **Feature flags** | OpenFeature + Unleash/Flagsmith | — | |
| **Temporal workers** | Sagas: paid booking, onboarding, GDPR erasure | Temporal | Replaces ad-hoc pg-boss chains |

**BFF** remains Next.js at the edge for the dashboard. Public slot GET is served from **CDN → Redis read model** without entering the booking write path.

## 3. Communication

| Pattern | Use |
| --- | --- |
| Kafka (or Pulsar) | Domain events, CDC, webhook fanout |
| gRPC | Intra-mesh, booking → entitlements consume |
| REST/JSON | Public developer API (unchanged `/v1` + `/v2`) |
| Temporal | Multi-step workflows with timers (expiry, dunning emails we still own, GDPR) |
| Redis | Slot cache, rate limit, session |
| Pub/Sub push | Calendar vendor webhooks → Calendar svc |

Saga example **paid booking**: Booking inserts `HELD` occupancy → Temporal starts → Billing creates Checkout → await Stripe signal (or poll) → Booking `CONFIRM` or `EXPIRE`. Compensation: release occupancy, expire session, release credits.

## 4. Stack deltas vs MVP

| Concern | MVP | Full-scale |
| --- | --- | --- |
| Orchestration | Compose / Fly | Kubernetes (GKE/EKS) two+ regions |
| Edge | Cloudflare | Cloudflare + Envoy mesh (Istio/Cilium) |
| Occupancy DB | Postgres gist exclusion | CRDB/Spanner multi-region |
| Jobs | pg-boss | Temporal + Kafka consumers |
| Auth | Shared JWT secret | Identity JWKS, mTLS |
| Frontend | Next.js Vercel | Same + edge SSR in multiple POPs; booking islands on Cloudflare Workers if needed |
| Observability | Grafana Cloud lite | Full SRE: SLO burn, tracing 100% of booking, chaos |
| IaC | Small Terraform | Terraform + Helm + GitOps (Argo CD) |

Languages stay TypeScript for product services. Occupancy-critical Booking service **may** be Go if p95 requires it; not mandatory if CRDB + good indexes suffice.

## 5. Edge & frontend

- Hosted booking: SSR at edge, slot payload from `GET /v1/public/slots` cached 5–15 s with `stale-while-revalidate`, invalidated by Kafka → cache-purge on occupancy change for that host.
- Dashboard: React Query + optional SSE for bookings (`/v1/stream/bookings`).
- Embed: versioned `embed.js` on R2/CDN; breaking widget protocol gets `embed@2`.
- Custom domains (Phase 2 product): CNAME to our edge, per-tenant TLS (Cloudflare for SaaS).

## 6. Availability math (99.99%)

Budget ≈ 4.3 min/month. Dependencies: Stripe (degraded: hold bookings, queue checkout), Google (degraded: stale slots flagged), Kafka (local outbox retry), Identity (gateway caches JWKS). Booking write path dependencies: Gateway, Booking svc, occupancy DB only. Billing is **not** on the critical path after hold.

## 7. API at scale

- Cursor pagination (`?cursor=`) on all lists; keep `page` one version.
- GraphQL **not** default; a BFF GraphQL is optional for mobile later.
- gRPC-JSON transcoding for public REST.
- Signed idempotency stored in Redis + durable table.

## 8. Trade-offs

Microservices cost: you need platform team, mesh, tracing, contract tests. Do **not** split before 1k paying orgs or a team > 8. The migration roadmap (`11`) is gated on metrics, not dates.
