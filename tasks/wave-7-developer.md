# Wave 7 — Developer platform (T-033)

### Laravel port (`shedflow-back`)

Nest T-033 is **DONE historically** (API keys, webhooks, OpenAPI). **Not ported** to Laravel — no `ApiKey` / webhook models or routes. Client developer page may still assume Nest billing Pro gate. Reopen as Laravel TODO when third-party integrations are prioritized (after receipts + portal). Pro gate no longer depends on Stripe T-024.

---

## T-033 — API keys, webhooks, OpenAPI

**Status:** DONE (Nest) / **NOT PORTED to Laravel**  
**Depends on:** T-014, T-008; soft plan gate optional  
**Design:** `docs/design/mvp/09-developer-api-and-webhooks.md`  
**Apps:** was `apps/api`, `apps/worker` → future `shedflow-back`; `apps/client` developer page; OpenAPI as needed

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

- [x] With API key, `GET /v1/organizations/:id/bookings` works without JWT.
- [x] Missing scope → 403.
- [x] Worker POSTs to `https://httpbin.org/post` in local manual test; CI uses a mock HTTP server.
- [x] `http://127.0.0.1:1/` endpoint rejected on create or on send (create-time URL parse + send-time DNS).
- [x] FREE org → `FEATURE_GATED`.
