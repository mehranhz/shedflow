# Wave 2 — Scheduling engine (T-010 … T-015)

**Design:** `docs/design/mvp/04-scheduling-engine.md`, `mvp/02-data-model.md`  
**Clock:** inject `Clock` from T-003. **TZ:** `@date-fns/tz`.

---

## T-010 — Schedules, weekly rules, date overrides

**Status:** TODO  
**Depends on:** T-006, T-001  
**Apps:** `apps/api`

### Implementation

- Prisma `Schedule`, `AvailabilityRule`, `DateOverride` + check constraints SQL (`02` §3 minutes chk).
- CRUD routes `04` §8. `PUT rules` is replace-all; reject overlapping windows same `dayOfWeek`.
- `createDefaultSchedule(orgId, hostUserId, timezone)` used from T-007 if available.
- MEMBER may only write own `hostUserId` schedules; OWNER/ADMIN any member of org.
- Only one `isDefault` per host: setting default unsets others.

### Acceptance

- [ ] Default Mon–Fri 540–1020 exists after org create (if T-007 wired).
- [ ] Overlapping rules → 400.
- [ ] Override unavailable hides that date (assert in T-012 tests if slots exist; here unit-test persistence).

---

## T-011 — Event types

**Status:** TODO  
**Depends on:** T-010  
**Design:** `02` EventType, `03` feature gate (limit 3 on FREE)

### Implementation

- Prisma `EventType`. Validate questions zod. `slug` unique per org.
- Location types enum. `priceId` / `subscriptionProductId` accepted as UUIDs but **not verified against Stripe until T-020** (store, ignore).
- Soft delete: `isActive=false`.
- FREE plan: max 3 active event types (`FEATURE_GATED`).
- `GET /v1/public/orgs/:orgSlug/event-types` lists `isActive && !isHidden`.

### Acceptance

- [ ] CRUD works scoped to org.
- [ ] Fourth active event type on FREE → 403 `FEATURE_GATED`.
- [ ] Public GET does not list hidden/inactive.

---

## T-012 — Slot generation

**Status:** TODO  
**Depends on:** T-011  
**Design:** `04` §2 and §10 (every edge case)

### Implementation

- `AvailabilityService.listSlots`.
- Route `GET /v1/public/orgs/:orgSlug/event-types/:eventSlug/slots?from&to&tz`.
- Range max 31 days. Invalid TZ → `INVALID_TIMEZONE`.
- Busy set: bookings (T-014) + `external_busy_blocks` (empty until T-016). Write the query now so T-014 fills it.
- Unit tests with frozen Clock for DST: use 2026-03-08 America/New_York spring-forward and 2026-11-01 fall-back (or the actual 2026 DST dates — **verify** with a small script). Also Asia/Kolkata display.
- No Google calls.

### Acceptance

- [ ] All cases in `04` §10 that do not require bookings: DST, TZ, minNotice, 24h window, overlapping rules already rejected.
- [ ] Truncation at 500 slots sets `truncated: true`.
- [ ] Public, rate-limited.

---

## T-013 — Customers

**Status:** TODO  
**Depends on:** T-006  
**Apps:** `apps/api`

### Implementation

- Prisma `Customer`. Unique `(organizationId, email)` — emails stored lowercased.
- `upsert(orgId, { email, name, phone, timezone })`.
- Authenticated list/get/patch. No public list.

### Acceptance

- [ ] Booking path (T-014) can upsert. List is tenant-scoped.
- [ ] Duplicate email same org returns same id.

---

## T-014 — Bookings create + exclusion constraint

**Status:** TODO  
**Depends on:** T-012, T-013, T-008  
**Design:** `04` §3, `02` §3 SQL exclusion

### Implementation

- Prisma `Booking` + **raw SQL migration** for `btree_gist` and `bookings_host_occupied_excl`. Document in `packages/db/README.md`.
- Copy buffers onto the row. `uid` nanoid 21.
- `POST /v1/public/bookings` + host `POST /v1/organizations/:orgId/bookings`.
- Idempotency **required** on public POST; write key in same transaction as booking when possible.
- Status: free+auto → `CONFIRMED`; `requiresConfirmation` → `PENDING_CONFIRMATION`; paid (`priceId` set) → `PENDING_PAYMENT` + `holdExpiresAt=now+15m` even before Stripe (T-021 wires checkout). If priceId set but billing down, still insert hold.
- Map gist violation → 409 `SLOT_UNAVAILABLE`.
- Outbox `booking.created` / `booking.confirmed`.
- Authenticated list/get with filters `status`, `from`, `to`, `eventTypeId`.
- E2e: **two concurrent public POSTs** same slot (use `Promise.all`).

### Acceptance

- [ ] One 201 and one 409 under concurrency.
- [ ] Slot disappears from T-012 results while CONFIRMED/PENDING_*.
- [ ] IDOR 404 across orgs.
- [ ] Exclusion constraint present in DB (`\d bookings` / e2e query `pg_constraint`).

---

## T-015 — Cancel, reschedule, confirm, signed links

**Status:** TODO  
**Depends on:** T-014  
**Design:** `04` §4–§7

### Implementation

- Prisma `SignedActionToken`. Issue on create/confirm.
- Public cancel/reschedule with token. Host confirm/cancel/reschedule/no-show.
- Reschedule = insert new + old `RESCHEDULED` (do not mutate start_at).
- Policy hours on event type.
- Internal routes stub for worker: `POST /internal/bookings/:id/confirm|expire` with HMAC (T-003/T-009 helper). Expire: CAS `PENDING_PAYMENT` → `EXPIRED`.

### Acceptance

- [ ] Invitee cancel inside policy works; outside → `OUTSIDE_POLICY`.
- [ ] Host can always cancel.
- [ ] Reschedule conflict leaves original CONFIRMED.
- [ ] Invalid token → 401.
- [ ] Expire internal only with valid HMAC.
