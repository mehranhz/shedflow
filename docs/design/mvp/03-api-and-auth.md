# MVP 03 — API design, authentication, authorization, tenancy

## 1. Style

- **REST**, JSON, `/v1` prefix on every public and authenticated route.
- No GraphQL in Phase 1.
- Version lives in the path. Breaking changes in Phase 2 get `/v2`; additive fields are not breaking.
- Controllers use existing `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Shared request/response types live in `@shedflow/shared` as **zod** schemas. Nest DTOs stay `class-validator` and must match the zod schema 1:1 (contract tests in T-003).
- Pagination: existing `Page` / `PageRequest` (`page` 1-based, `limit` default 25, max 100). Query: `?page=1&limit=25&sort=createdAt:desc`.
- Dates in payloads: RFC 3339 with offset, e.g. `2026-09-11T16:30:00.000Z` or `2026-09-11T12:30:00.000-04:00`. Stored UTC.
- Money: `{ amountMinor: 15000, currency: "USD" }`.

## 2. Base URLs

| Audience | Host (prod) | Service |
| --- | --- | --- |
| Browser dashboard | `https://app.schedflow.com` | `apps/client` (BFF) |
| Hosted booking | `https://app.schedflow.com/{orgSlug}/{eventSlug}` | `apps/client` SSR |
| Public scheduling API | `https://api.schedflow.com/v1/public/...` | `apps/api` |
| Authenticated app / developer API | `https://api.schedflow.com/v1/...` | `apps/api` |
| Billing (browser BFF + internal) | `https://billing.schedflow.com/v1/...` | `apps/billing` |
| Stripe / Google webhooks | `https://billing…/webhooks/stripe`, `https://api…/webhooks/google-calendar` | unversioned, not `/v1` |

Local: `api` `:3001`, `billing` `:3002`, `worker` `:3003`, `client` `:3000`. Client already uses `API_URL` default `http://localhost:3001`. After versioning, `apiFetch` must prefix `/v1` except `/auth/*` which we **keep unversioned** for compatibility with NextAuth (`/auth/login`, `/auth/register`, `/auth/me`). New auth routes (`/auth/refresh`, `/auth/forgot-password`, …) also sit under `/auth`.

## 3. Global headers

| Header | Who sends | Rule |
| --- | --- | --- |
| `Authorization: Bearer <jwt>` | Client BFF, billing (user JWT) | Required on all non-`@Public()` routes |
| `Authorization: Bearer sf_live_…` | Developers | Alternative to JWT; `ApiKeyGuard` |
| `Idempotency-Key` | Clients on POST/PATCH/DELETE of bookings, payments, invites | UUID or opaque string ≤ 64 chars. Required on public `POST /bookings`. Replay within 24 h returns stored response if request hash matches; **409** if same key, different body |
| `X-Request-Id` | Any; generated if missing | Echoed; logged; propagated to billing and worker |
| `X-Organization-Id` | Dashboard when user has multiple orgs | UUID; must match a membership. If omitted, use JWT `orgId` (active org) |
| `Stripe-Signature` / Google channel headers | Providers | Webhook verification |
| `X-Internal-Timestamp` + `X-Internal-Signature` | api ↔ billing ↔ worker | HMAC-SHA256 of `timestamp.method.path.body` with `INTERNAL_API_SECRET`. Reject if `|now - ts| > 30s` |

CORS: authenticated API — allow `APP_URL` only, credentials. Public API — `*` GET/POST for `/v1/public/*`. Webhooks — no CORS (server-to-server).

## 4. Error envelope

Every 4xx/5xx:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "That time is no longer available.",
    "details": { "startAt": "2026-09-12T16:00:00.000Z" },
    "requestId": "…"
  }
}
```

| HTTP | `code` (non-exhaustive) |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_TIMEZONE`, `INVALID_QUESTION_ANSWER` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_API_KEY` |
| 403 | `FORBIDDEN`, `FEATURE_GATED`, `EMAIL_NOT_VERIFIED` (only if we later require it; **MVP does not block unverified users**) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `SLOT_UNAVAILABLE`, `IDEMPOTENCY_MISMATCH`, `EMAIL_TAKEN`, `SLUG_TAKEN` |
| 422 | `PAYMENT_REQUIRED`, `CONNECT_INCOMPLETE`, `INSUFFICIENT_CREDITS`, `OUTSIDE_POLICY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL` |
| 502/503 | `UPSTREAM_UNAVAILABLE` (Stripe/Google down; booking still held if applicable) |

Global `AllExceptionsFilter` maps `RepositoryError` subclasses (already exist) and domain errors. Never leak Prisma/stack traces. `details` may include `fieldErrors` from class-validator.

A global interceptor wraps 2xx as the resource itself (no `{ data }` envelope) to stay compatible with `/auth/me`. Lists use `{ items, total, page, limit, pageCount }` from `Page`.

## 5. Authentication (builds on existing NextAuth + Nest JWT)

**Already shipped:** `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, NextAuth credentials, JWT in session, `apiFetch` Bearer.

### 5.1 Access + refresh tokens

| Token | TTL | Storage |
| --- | --- | --- |
| Access JWT | **15 minutes** (change from current 1 h) | NextAuth JWT / session (`accessToken`) |
| Refresh | **30 days**, hashed in `refresh_tokens`, rotated | NextAuth JWT (`refreshToken`) **or** httpOnly cookie `sf_refresh` on the API domain. MVP: keep carrying both in the NextAuth token to avoid a new cookie domain, and rotate on `/auth/refresh`. |

JWT payload after T-006:

```ts
type JwtPayload = {
  sub: string; // user id
  email: string;
  orgId?: string; // active organization
  role?: "OWNER" | "ADMIN" | "MEMBER";
  typ: "access";
};
```

`POST /auth/refresh` `{ refreshToken }` → new access + refresh; old refresh `revokedAt` set; reuse of a revoked token **revokes the whole family** (theft detection).

Update NextAuth: `SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600`; `jwt` callback refreshes access token when `exp` is within 60 s (`apps/client/auth.ts`). If refresh fails, sign out.

### 5.2 Password reset & email verification

- `POST /auth/forgot-password` `{ email }` always 204 (no enumeration). Insert `UserToken` PASSWORD_RESET (1 h). Worker emails link `APP_URL/reset-password?token=`.
- `POST /auth/reset-password` `{ token, password }` hashes token, marks used, rotates all refresh tokens.
- On register: create `EMAIL_VERIFY` token (24 h), send email. `POST /auth/verify-email` `{ token }`. Unverified users **can use the product**; dashboard shows a banner.

### 5.3 Register creates a tenant

Change `POST /auth/register` to accept optional `{ email, password, name, organizationName, timezone }`. In one transaction: user + organization (slug from name + short suffix) + OWNER membership + default schedule (Mon–Fri 09:00–17:00 in org timezone). If `organizationName` omitted, `{name}'s workspace` / email local-part.

### 5.4 Guards (Nest)

| Guard | Role |
| --- | --- |
| `JwtAuthGuard` (global, exists) | `@Public()` opt-out |
| `OrgGuard` | Resolves org from JWT `orgId` or `X-Organization-Id`; loads membership; attaches `RequestContext` |
| `RolesGuard` + `@Roles(Role.OWNER, Role.ADMIN)` | |
| `ApiKeyGuard` | On `/v1` routes that declare `@ApiKeyOrJwt()`; keys have scopes |
| `InternalGuard` | `/internal/*` |
| `FeatureGuard` + `@RequiresPlan('PRO')` | Platform plan gate |

`RequestContext` (ALS, like Prisma transactions): `{ requestId, userId, organizationId, role, actorType }`. Repositories read org from here **and** still take it as an argument (belt and braces).

## 6. Authorization matrix

| Resource | OWNER | ADMIN | MEMBER | Invitee (signed link) | Public | API key |
| --- | --- | --- | --- | --- | --- | --- |
| Org settings, slug, destroy | ✓ | | | | | |
| Billing Connect, platform plan, refunds | ✓ | ✓ | | | | |
| Team invite/remove, roles | ✓ | ✓ (cannot touch OWNER) | | | | |
| Event types, schedules of any host | ✓ | ✓ | own only | | | `event_types:write` |
| Bookings list/cancel/reschedule | ✓ | ✓ | own host | own booking | create | `bookings:*` |
| Customers | ✓ | ✓ | read own bookings' customers | | | `customers:read` |
| API keys / webhook endpoints | ✓ | ✓ | | | | |
| Slots GET | | | | | ✓ | ✓ |

Impersonation (T-038): platform operator JWT with `impersonatingOrgId`; audit every call.

## 7. Idempotency

Middleware on routes decorated `@Idempotent()`:

1. Require `Idempotency-Key`.
2. `scope` = `org:{id}` or `public:{sha256(ip+ua+key)}`.
3. Hash canonical JSON body (`requestHash`).
4. Insert row. Unique `(scope, key)`: on conflict, if hash matches and not expired, return stored `responseStatus` + body; if hash differs → `IDEMPOTENCY_MISMATCH`.
5. On success/4xx, persist response. On 5xx, **do not** persist so the client may retry (unless a booking row was committed — then persist the 201). Booking create handles this by writing the key in the same transaction as the booking.

Stripe webhooks use `stripe_events.id` as the idempotency key, not this table.

## 8. Route catalogue

Auth (existing + new) — all on `apps/api`:

```
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout              // revoke refresh
GET  /auth/me                  // include memberships[]
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/verify-email
POST /auth/resend-verification
```

Organizations / team:

```
GET    /v1/organizations
POST   /v1/organizations
GET    /v1/organizations/:orgId
PATCH  /v1/organizations/:orgId
DELETE /v1/organizations/:orgId          // OWNER, soft-delete
POST   /v1/organizations/:orgId/switch   // re-issue JWT with orgId
GET    /v1/organizations/:orgId/members
POST   /v1/organizations/:orgId/invitations
DELETE /v1/organizations/:orgId/invitations/:id
POST   /v1/invitations/:token/accept     // authenticated user
PATCH  /v1/organizations/:orgId/members/:userId  // role/status
DELETE /v1/organizations/:orgId/members/:userId
```

Schedules & event types: see `04-scheduling-engine.md`.
Bookings public + authenticated: see `04`.
Calendar: see `06`.
Billing: see `05` (`/v1/billing/...` on billing service; client BFF proxies `/api/bff/billing/*`).
Developer: see `09`.
Internal:

```
POST /internal/bookings/:id/confirm
POST /internal/bookings/:id/expire
POST /internal/checkout-sessions          // billing
GET  /internal/entitlements?orgId&customerId&productId
POST /internal/credits/consume
POST /internal/credits/release
```

Health (all services): `GET /health` → `{ status, db, version }` (worker: `{ status, queue }`). `GET /metrics` Prometheus.

## 9. Rate limits (MVP)

`@nestjs/throttler` + Cloudflare.

| Bucket | Limit |
| --- | --- |
| `POST /auth/login` per IP | 10 / 15 min |
| `POST /auth/register` per IP | 5 / h |
| `POST /v1/public/bookings` per IP | 20 / 10 min |
| `GET /v1/public/.../slots` per IP | 60 / min |
| Authenticated API per user | 300 / min |
| API key | 120 / min (Free), 600 / min (Pro) |
| Webhook inbound |  no app limit (Stripe retries) |

Return `Retry-After`.

## 10. Multi-tenant isolation

1. `OrgGuard` + repository `organizationId` (see `02` §8).
2. Public routes resolve org by **slug**, then all queries use that id.
3. No Postgres RLS in MVP (Phase 2).
4. Cross-tenant IDOR tests in e2e: member of org A cannot GET org B event type by UUID.

## 11. Feature gating

| Feature | FREE | PRO |
| --- | --- | --- |
| Event types | 3 | unlimited |
| Team members | 1 | unlimited |
| Paid bookings / Connect | | ✓ |
| Membership subscriptions | | ✓ |
| Remove badge / brand color | | ✓ |
| API keys + webhooks | | ✓ |
| Google Calendar | ✓ | ✓ |
| Outlook | | ✓ (flag) |

`FeatureGuard` reads `organization.platformPlan`. Stripe updates the plan via webhook (see `14`).

## 12. NextAuth / client changes required

- Persist `refreshToken` on the JWT; refresh access in `jwt` callback.
- `apiFetch` prefixes `/v1` for non-auth paths; send `X-Organization-Id` from a cookie `sf_org` set on org switch.
- BFF route `app/api/bff/[...path]/route.ts` forwards to api/billing so the browser still never talks to Nest except the **public booking page**, which calls `NEXT_PUBLIC_API_URL/v1/public/*` from the client for slot queries (latency).
