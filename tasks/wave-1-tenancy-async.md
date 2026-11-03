# Wave 1 — Tenancy and async backbone (T-006 … T-009)

**Design:** `mvp/02-data-model.md`, `mvp/03-api-and-auth.md`, `mvp/01-architecture.md` §3/§6, `mvp/07-notifications.md` pipeline

### Laravel port (`shedflow-back`)

| Nest task | Laravel reality |
| --- | --- |
| T-006 Orgs, memberships, invitations, RBAC | **Done** — org CRUD, members, invitations, policies/roles |
| T-007 Register creates workspace; JWT org claim; switch | **Done** — register + `initializeAccount` + org switch |
| T-008 Idempotency, outbox, audit log | **Not ported** — no idempotency/outbox/audit tables in Laravel yet |
| T-009 `apps/worker` + pg-boss | **OBSOLETE** as Nest app — use Laravel queues/scheduler when async is needed |

---

## T-006 — Organizations, memberships, invitations, RBAC

**Status:** DONE (Laravel ported)  
**Depends on:** T-001, T-003  
**Apps:** `apps/api`

### Goal

Multi-tenant core. Every subsequent module depends on this.

### Implementation

- Prisma: `Organization`, `Membership`, `Invitation` as in `02`.
- Repositories with **required `organizationId`** on tenant finds (`findById(orgId, id)`).
- `RequestContext` ALS: `{ requestId, userId, organizationId, role, actorType }`.
- `OrgGuard` + `@Roles()` + `RolesGuard`.
- Routes from `03` §8 Organizations / team.
- Slug: lowercase `[a-z0-9-]`, unique; generate from name + 4-char suffix on collision.
- Invite: email + role; hashed token; accept requires logged-in user whose email matches (case-insensitive).
- MEMBER cannot change OWNER; cannot invite OWNER.
- Register **does not** yet create org (T-007). Until T-007, authenticated users with zero memberships get `GET /v1/organizations` `[]` and may `POST /v1/organizations`.

### Acceptance

- [x] Create org → creator is OWNER.
- [x] Second user invited ADMIN can list members; MEMBER cannot PATCH org slug.
- [x] IDOR: org A user `GET` org B by UUID → 404 (not 403).
- [x] Unique slug conflict → `SLUG_TAKEN`.

---

## T-007 — Register creates workspace; JWT carries `orgId` + `role`

**Status:** DONE (Laravel ported)  
**Depends on:** T-006, T-004  
**Design:** `mvp/03` §5.3, `mvp/04` §9

### Implementation

- `POST /auth/register` body optional `name`, `organizationName`, `timezone` (valid IANA).
- Transaction: user + org + OWNER membership + **default schedule** (Mon–Fri 09:00–17:00) — if Schedule model not yet migrated, create a follow-up hook in T-010 and here only org+membership. **Prefer adding Schedule tables in T-010 and calling a domain function `createDefaultSchedule` from T-010; T-007 can no-op schedule if T-010 not merged — but if T-010 is done first, wire it.**
- JWT includes `orgId`, `role`. `/auth/me` returns `memberships[]` and `activeOrganization`.
- `POST /v1/organizations/:orgId/switch` re-issues access token.
- Client: store active org in cookie `sf_org`; send `X-Organization-Id` from BFF once BFF exists (T-029). Until then, JWT `orgId` is enough.

### Acceptance

- [x] New register yields one org and OWNER JWT.
- [x] Switch org (user in two orgs) changes `orgId` in subsequent `/auth/me`.
- [x] Existing users without org can still POST organization.

---

## T-008 — Idempotency, outbox, audit log

**Status:** DONE (Nest historical) / **TODO on Laravel** if booking idempotency or domain events are required before launch  
**Depends on:** T-001, T-003, T-006 (orgId on audit)  
**Design:** `mvp/02` IdempotencyKey, DomainEvent, AuditLog; `mvp/03` §7; `mvp/10` §7  
**Apps:** `shedflow-back` (Laravel queues / DB tables — not Nest)

### Implementation

- Nest Prisma tables historically done. Laravel: add equivalent tables/middleware only when a consumer needs them.
- `@Idempotent()` interceptor: see `03` §7. Persist 2xx/4xx; do not persist 5xx unless booking committed (document; booking uses same txn in T-014).
- `Outbox` helper: `emit(type, payload, organizationId)` **must** be called inside `TransactionManager.runInTransaction`.
- `AuditService.record(...)`.
- Cleanup is T-026; TTL 24h on idempotency rows (`expiresAt`).
- Unit test interceptor with in-memory repo or e2e on a dummy `@Public() @Idempotent() POST /v1/__test/echo` **only in non-prod** — better: test via a real route once T-006 POST org is idempotent. Make `POST /v1/organizations` idempotent.

### Acceptance

- [x] Two identical POSTs with same Idempotency-Key + body → one org row, same response.
- [x] Same key different body → 409 `IDEMPOTENCY_MISMATCH`.
- [x] Creating an org writes `audit_logs` and a `domain_events` row in the same transaction (query DB in e2e).

---

## T-009 — `apps/worker` + pg-boss + outbox relay

**Status:** DONE (Nest historical) / **OBSOLETE** as target architecture — prefer Laravel queue workers  
**Depends on:** T-008  
**Apps:** was `apps/worker`; new work → `shedflow-back` queues  
**Design:** `mvp/01` worker, `mvp/07` §1

### Implementation

- Nest standalone app historically done. Do not extend pg-boss worker for new features.
- Dependency `@shedflow/db`, env `DATABASE_URL`, `INTERNAL_API_SECRET`.
- pg-boss: start on boot, schema `pgboss`.
- Job `outbox.relay`: every 1s, `SELECT … FROM domain_events WHERE status='PENDING' AND available_at <= now() FOR UPDATE SKIP LOCKED LIMIT 50`, enqueue job `event:{type}`, mark PROCESSED. On handler throw: attempts++, backoff, FAILED at 10.
- `JobQueue` port in api that **only writes outbox** (api does not host pg-boss).
- Internal HMAC utility in `packages/shared` or duplicated small helper — prefer shared `internalAuth.ts`.
- Turbo `dev` includes worker.
- No email sends yet (log job payload).

### Acceptance

- [x] Inserting a `domain_events` row in DB results in a worker log line within ~3s.
- [x] Poison payload: after retries, status FAILED, worker still running.
- [x] `GET http://localhost:3003/health` 200.
