# MVP 09 — Developer API and webhooks

Pro-gated. Same REST as the dashboard (`/v1/...`) authenticated with API keys **or** JWT.

## 1. API keys

```
POST /v1/organizations/:orgId/api-keys   { name, scopes[] }
→ { id, prefix, secret, scopes }   // secret only once: sf_live_<random 32>
GET /v1/organizations/:orgId/api-keys
DELETE /v1/organizations/:orgId/api-keys/:id
```

Store `sha256(secret)` in `keyHash`. Prefix `sf_live_` (prod) / `sf_test_` (non-prod). Authorization: `Bearer sf_live_...`. Scopes:

`bookings:read|write`, `event_types:read|write`, `customers:read`, `webhooks:write`, `availability:read`.

Missing scope → 403. `lastUsedAt` updated at most once per minute.

## 2. Idempotency & versioning

Same as `03`. Document in a public OpenAPI file `packages/shared/openapi/v1.yaml` generated or hand-written in T-033. Breaking changes only in `/v2`.

Pagination: `page`/`limit`. Rate limits in `03` §9.

## 3. Webhook endpoints

```
POST /v1/organizations/:orgId/webhook-endpoints
{ "url": "https://example.com/hooks/schedflow", "events": ["booking.confirmed", "*"] }
→ { id, secret }  // secret once, whsec_...
```

Worker on each domain event: for every active endpoint whose `events` includes the type or `*`, insert `webhook_deliveries` and send:

```
POST {url}
Headers:
  Content-Type: application/json
  X-SchedFlow-Event: booking.confirmed
  X-SchedFlow-Delivery: {deliveryId}
  X-SchedFlow-Timestamp: {unix}
  X-SchedFlow-Signature: v1={hmac_sha256(secret, `${timestamp}.${rawBody}`)}
Body:
{
  "id": "evt_...",
  "type": "booking.confirmed",
  "createdAt": "...",
  "organizationId": "...",
  "data": { /* resource snapshot */ }
}
```

Verify docs: reject if `|now-ts|>300s`. Success = HTTP 2xx in 10 s. Retries: 1m, 5m, 25m, 2h, 8h, 24h then FAILED. Manual `POST .../webhook-endpoints/:id/deliveries/:id/redeliver`.

SSR F: TLS only; block private IPs (SSRF): deny `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, link-local. Resolve DNS and check again.

## 4. Event types delivered in MVP

`booking.created`, `booking.confirmed`, `booking.cancelled`, `booking.rescheduled`, `booking.expired`, `payment.succeeded`, `payment.refunded`, `subscription.created`, `subscription.updated`, `subscription.canceled`.

Payloads: zod in `@shedflow/shared/events`.

## 5. OpenAPI & DX

README snippet + example Node `fetch`. No official SDK in MVP. Stripe-like signature scheme so copy-paste verifiers work.
