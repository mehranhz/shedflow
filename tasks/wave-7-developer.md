# Wave 7 — Developer platform (T-033)

---

## T-033 — API keys, webhooks, OpenAPI

**Status:** TODO  
**Depends on:** T-014, T-024 (Pro gate), T-009, T-008  
**Design:** `docs/design/mvp/09-developer-api-and-webhooks.md`  
**Apps:** `apps/api`, `apps/worker`, `apps/client` developer page, `packages/shared/openapi/v1.yaml`

### Implementation

- Prisma `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`.
- Key create returns secret once; Bearer `sf_test_` / `sf_live_` by `NODE_ENV`.
- `ApiKeyOrJwt` guard + scopes.
- Webhook CRUD; secret once `whsec_`.
- Worker dispatcher: HMAC headers, SSRF block (`09` §3), retries.
- Redeliver route.
- OpenAPI skeleton covering public bookings + authenticated event types/bookings.
- Dashboard Developer: create key (dialog shows secret), endpoints, delivery table.
- Pro-gated.

### Acceptance

- [ ] With API key, `GET /v1/organizations/:id/bookings` works without JWT.
- [ ] Missing scope → 403.
- [ ] Worker POSTs to `https://httpbin.org/post` in local manual test; CI uses a mock HTTP server.
- [ ] `http://127.0.0.1:1/` endpoint rejected on create or on send (create-time URL parse + send-time DNS).
- [ ] FREE org → `FEATURE_GATED`.
