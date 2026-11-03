# Wave 2 — Scheduling engine (T-010 … T-015)

**Design:** `docs/design/mvp/04-scheduling-engine.md`, `mvp/02-data-model.md`  
**Clock:** inject `Clock` from T-003. **TZ:** `@date-fns/tz` (client); Laravel uses Carbon UTC.

### Laravel port (`shedflow-back`) — **DONE** for T-010…T-015 core

Verified: schedules/rules/overrides, event types (incl. `requires_confirmation`), public slots, customers (incl. nullable `user_id`), public + org bookings, cancel/reschedule/confirm/no-show, signed action tokens, `GET/POST /v1/me/bookings`.  
**Not in scope here:** Stripe `priceId` / `PENDING_PAYMENT` checkout — replaced by Wave 4 receipt confirmation. Exclusion-constraint / gist may still differ from Nest raw SQL; concurrency covered by availability checks + locks in `BookingService`.

---

## T-010 — Schedules, weekly rules, date overrides

**Status:** DONE (Laravel ported)  
**Depends on:** T-006, T-001  
**Apps:** `apps/api`

### Implementation

- Prisma `Schedule`, `AvailabilityRule`, `DateOverride` + check constraints SQL (`02` §3 minutes chk).
- CRUD routes `04` §8. `PUT rules` is replace-all; reject overlapping windows same `dayOfWeek`.
- `createDefaultSchedule(orgId, hostUserId, timezone)` used from T-007 if available. **T-007 left a no-op** `OrganizationsService.createDefaultScheduleIfAvailable` — replace that body and call it from org create.
- MEMBER may only write own `hostUserId` schedules; OWNER/ADMIN any member of org.
- Only one `isDefault` per host: setting default unsets others.

### Acceptance

- [x] Default Mon–Fri 540–1020 exists after org create (if T-007 wired).
- [x] Overlapping rules → 400.
- [x] Override unavailable hides that date (assert in T-012 tests if slots exist; here unit-test persistence).

---

## T-011 — Event types

**Status:** DONE (Laravel ported)  
**Depends on:** T-010  
**Design:** `02` EventType, `03` feature gate (limit 3 on FREE)

### Implementation

- Prisma `EventType` historically; Laravel `EventType` model + CRUD. Validate questions. `slug` unique per org.
- Location types enum. **Do not require Stripe `priceId` / `subscriptionProductId`.** Receipt requirement lands in Wave 4 (`requiresPaymentReceipt`). `requiresConfirmation` already exists.
- Soft delete: `isActive=false`.
- FREE plan: max 3 active event types (`FEATURE_GATED`) — enforce in Laravel if/when `platform_plan` gates matter.
- `GET /v1/public/orgs/:orgSlug/event-types` lists `isActive && !isHidden`.

### Acceptance

- [x] CRUD works scoped to org.
- [x] Fourth active event type on FREE → 403 `FEATURE_GATED`.
- [x] Public GET does not list hidden/inactive.

---

## T-012 — Slot generation

**Status:** DONE (Laravel ported)  
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

- [x] All cases in `04` §10 that do not require bookings: DST, TZ, minNotice, 24h window, overlapping rules already rejected.
- [x] Truncation at 500 slots sets `truncated: true`.
- [x] Public, rate-limited.

---

## T-013 — Customers

**Status:** DONE (Laravel ported; `user_id` nullable ready for Wave 9)  
**Depends on:** T-006  
**Apps:** `shedflow-back` (was `apps/api`)

### Implementation

- Prisma `Customer`. Unique `(organizationId, email)` — emails stored lowercased.
- `upsert(orgId, { email, name, phone, timezone })`.
- Authenticated list/get/patch. No public list.

### Acceptance

- [x] Booking path (T-014) can upsert. List is tenant-scoped.
- [x] Duplicate email same org returns same id.

---

## T-014 — Bookings create + exclusion constraint

**Status:** DONE (Laravel ported)  
**Depends on:** T-012, T-013, T-008  
**Design:** `04` §3, `02` §3 SQL exclusion

### Implementation

- Laravel `Booking` + create via `BookingService` (availability assert + transaction). Nest had gist exclusion; Laravel relies on slot checks — strengthen with DB constraint later if needed.
- Copy buffers onto the row. Public `uid` generated server-side.
- `POST /v1/public/bookings` + host `POST /v1/organizations/:orgId/bookings` + `GET /v1/me/bookings`.
- Idempotency on public POST: Nest had it; Laravel may still need T-008 port for hard guarantees.
- Status: free+auto → `CONFIRMED`; `requiresConfirmation` → `PENDING_CONFIRMATION`. **Paid Stripe/`priceId` → `PENDING_PAYMENT` path is OBSOLETE** — use Wave 4 receipt upload + confirmation instead.
- Authenticated list/get with filters `status`, `from`, `to`, `eventTypeId`.

### Acceptance

- [x] One 201 and one 409 under concurrency.
- [x] Slot disappears from T-012 results while CONFIRMED/PENDING_*.
- [x] IDOR 404 across orgs.
- [x] Exclusion constraint present in DB (`\d bookings` / e2e query `pg_constraint`).

---

## T-015 — Cancel, reschedule, confirm, signed links

**Status:** DONE (Laravel ported)  
**Depends on:** T-014  
**Design:** `04` §4–§7

### Implementation

- Laravel `SignedActionToken`. Issue on create.
- Public cancel/reschedule with token. Host confirm/cancel/reschedule/no-show.
- Reschedule = insert new + old `RESCHEDULED` (do not mutate start_at).
- Policy hours on event type.
- Nest internal expire for `PENDING_PAYMENT` holds is **OBSOLETE** with Stripe deferral; if receipt holds need expiry later, implement as Laravel job.

### Acceptance

- [x] Invitee cancel inside policy works; outside → `OUTSIDE_POLICY`.
- [x] Host can always cancel.
- [x] Reschedule conflict leaves original CONFIRMED.
- [x] Invalid token → 401.
- [x] Expire internal only with valid HMAC.
