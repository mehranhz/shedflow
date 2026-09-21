# Wave 9 — Customer identity & portal auth (T-040 … T-044)

**Design:** `docs/design/00-product-scope.md` §2 (Customer persona), `mvp/03-api-and-auth.md`, `mvp/10-security-and-privacy.md`, `full-scale/06-security-compliance.md` §1  
**Goal:** Introduce first-class **end-customer** accounts distinct from org staff (`OWNER`/`ADMIN`/`MEMBER`), so invitees can log in, claim bookings, and mutate their data across businesses they booked with.  
**Does not duplicate:** Waves 0–1 auth for staff, T-013 Customers (CRM rows), T-015 signed action links (keep as fallback for email-only flows), T-034 GDPR export/erasure for staff `User`.

**Principle:** Staff dashboard stays under `/dashboard/*`. Customer portal lives under `/portal/*` (or `/account/*` — pick one prefix and reserve it before `[orgSlug]`). Signed manage links remain valid for guests.

---

## T-040 — CustomerUser link model + actor claims

**Status:** TODO  
**Depends on:** T-006, T-013, T-007  
**Apps:** `packages/db`, `apps/api`

### Implementation

- Prisma: optional `Customer.userId` (nullable FK to `User`) + unique `(organizationId, userId)` when set. Index for “all Customer rows for this user”.
- JWT / session claims: `actorType: 'staff' | 'customer'` (or derive: staff if any active `Membership`, else customer). Never grant org RBAC scopes to pure customer sessions.
- `RequestContext` already has `actorType` — wire customer paths to set `actorType: 'customer'` and **no** `organizationId` from membership; active business context is a separate `activeCustomerOrgId` / `X-Customer-Org-Id` header.
- Migration backfill: leave existing customers unlinked (`userId` null).
- Audit: log link/unlink events.

### Acceptance

- [ ] A user with only Customer links cannot call `GET /v1/organizations/:orgId/bookings` (404/403 as IDOR rules require).
- [ ] A staff user who also booked as a customer can hold both membership and customer links without conflating roles.
- [ ] Tenant finds on Customer still always require `organizationId`.

### Tests

- Unit: claim mapping; e2e: staff token rejected on customer-only routes and vice versa.

---

## T-041 — Customer register / login / magic-link claim

**Status:** TODO  
**Depends on:** T-040, T-004, T-005  
**Apps:** `apps/api`, `apps/worker`, `packages/emails`

### Implementation

- Public customer auth (reuse password hashing + refresh family from Wave 0):
  - `POST /v1/customer/auth/register` `{ email, password, name?, timezone?, locale? }` — creates `User` **without** org membership.
  - `POST /v1/customer/auth/login` — same credential path; response includes `actorType: 'customer'` and list of linked orgs (may be empty).
  - Keep NextAuth credentials provider able to branch: after `/auth/login`, if no memberships and customer links exist → redirect to portal (client T-045).
- **Claim booking / email verification magic link:**
  - `POST /v1/customer/auth/claim` `{ email }` → always 204; email magic link with hashed token.
  - `POST /v1/customer/auth/claim/confirm` `{ token }` → links all `Customer` rows matching email (case-insensitive) to the user; issues session.
  - Optional: from manage page, “Save to my account” CTA posts claim with booking token proof.
- Rate-limit claim + login (reuse public limiter patterns).
- Email templates: `customer-claim`, `customer-welcome`.

### Acceptance

- [ ] Guest who booked as `ada@…` can claim and see that booking in customer APIs (T-043).
- [ ] Claim email enumeration-safe (identical response whether or not email exists).
- [ ] Password login works for customer-only users; refresh rotation + family revoke still apply.
- [ ] Staff seed user unchanged; new seed customer documented in T-044.

### Tests

- E2e: book as guest → claim → list bookings; reuse of claim token fails.

---

## T-042 — Customer session context & org switcher API

**Status:** TODO  
**Depends on:** T-041  
**Apps:** `apps/api`

### Implementation

- `GET /v1/customer/me` — profile + `businesses[]` `{ organizationId, slug, name, brandColor, logoUrl, customerId, lastBookingAt }`.
- `POST /v1/customer/businesses/:organizationId/switch` — sets active customer org on access token / cookie contract (mirror staff `sf_org` with `sf_customer_org`).
- Guard `CustomerAuthGuard` + `CustomerOrgGuard` for scoped routes.
- Idempotency on mutating customer endpoints (`Idempotency-Key`).
- Optimistic concurrency: where updating Customer profile, require `If-Match` / `updatedAt` version → `409 CONFLICT`.

### Acceptance

- [ ] User with bookings in two orgs sees both; switch changes subsequent scoped lists.
- [ ] Switching to an org without a Customer link → 404.
- [ ] Cross-business IDOR: booking ids from org A never returned under org B context.

### Tests

- E2e multi-org fixture (second org + booking) + switch.

---

## T-043 — Customer bookings & profile read/write API foundation

**Status:** TODO  
**Depends on:** T-042, T-014, T-015  
**Apps:** `apps/api`

### Implementation

Minimum portal API surface (expand in later waves):

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/customer/bookings` | Filter `status`, `from`, `to`, `organizationId?`; paginated |
| GET | `/v1/customer/bookings/:uid` | Must belong to linked Customer |
| POST | `/v1/customer/bookings/:uid/cancel` | Policy same as invitee; emit outbox; idempotent |
| POST | `/v1/customer/bookings/:uid/reschedule` | Same conflict rules as T-015; `409 SLOT_UNAVAILABLE` |
| GET/PATCH | `/v1/customer/profile` | name, phone, timezone, locale; not email change without verify |
| POST | `/v1/customer/bookings` | Authenticated book for active org (upsert Customer by user email) |

- Preserve signed-token public routes; do not remove email manage links.
- Domain events include `actorType: customer` + `userId`.
- Rate limits stricter on cancel/reschedule bursts.

### Acceptance

- [ ] Authenticated cancel inside policy succeeds; outside → `OUTSIDE_POLICY`.
- [ ] Concurrent reschedule to same slot: one 200, one 409.
- [ ] Guest token still works without login.

### Tests

- Port T-015 invitee cases to customer JWT; IDOR suite.

---

## T-044 — Seed + fixtures for customer persona

**Status:** TODO  
**Depends on:** T-041, T-043  
**Apps:** `packages/db`, `apps/client/e2e`, docs

### Implementation

- Extend `packages/db/prisma/seed.ts`:
  - Customer user: `customer@shedflow.dev` / same password convention as owner (`Password123!`).
  - Link to Acme `Customer` row; optional second demo booking.
  - Document in `apps/client/README.md` and `.env.example` comments (no new secrets).
- Playwright fixture helpers: `loginAsCustomer`, `loginAsOwner`.
- Do **not** invent alternate credentials in docs beyond seed.

### Acceptance

- [ ] `pnpm --filter @shedflow/db seed` prints customer login alongside owner.
- [ ] E2e can authenticate both personas against local stack.

### Tests

- Seed idempotency; smoke login for customer.
