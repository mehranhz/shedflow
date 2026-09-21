# Wave 11 — Customer dashboard & appointment management (T-049 … T-054)

**Design:** `mvp/04-scheduling-engine.md`, `mvp/08-frontend.md` §4 (booking primitives), Phase-2 notes in `full-scale/03-scheduling-at-scale.md` for recurring/waitlist **hooks only**  
**Goal:** Give customers a home surface to see upcoming appointments, act on them, book again, and view history — mobile-first, enterprise conflict handling.  
**Does not duplicate:** T-027/T-015 guest SlotPicker + signed cancel/reschedule; T-031 staff bookings table.

---

## T-049 — Customer home dashboard

**Status:** TODO  
**Depends on:** T-046, T-043  
**Apps:** `apps/client`, `apps/api` (aggregates if needed)

### Implementation

- `/portal` home cards (not a staff KPI dashboard):
  1. **Next appointment** (primary CTA: Join / Directions / Manage)
  2. **Actions needed** (PENDING_CONFIRMATION, PENDING_PAYMENT, incomplete forms — forms wave may stub)
  3. **Payments due** count (link to Wave 13)
  4. **Waitlist** count (empty until T-065; show empty state)
- Pull from `GET /v1/customer/home` aggregate (preferred) or parallel client queries.
- Empty state: “Book with {business}” → public `/[orgSlug]` or in-portal book (T-051).
- Poll/refetch on focus; no websocket required.

### Acceptance

- [ ] Seed customer with upcoming booking sees it above the fold on mobile.
- [ ] Zero bookings → single clear CTA, no broken widgets.
- [ ] Skeletons for each section independently.

### Tests

- Playwright home with seeded booking; axe.

---

## T-050 — Appointments list & detail

**Status:** TODO  
**Depends on:** T-049  
**Apps:** `apps/client`

### Implementation

- `/portal/appointments` — tabs: Upcoming | Past | Cancelled; filters by business when multi-org.
- Detail `/portal/appointments/[uid]`: status badge, when/where, host display name, answers, policy summary (cancel/reschedule windows), payment status, notes/attachments placeholders.
- Actions: Cancel, Reschedule, Book again, Add to calendar (ICS download from existing notification assets or public endpoint), Pay now if `PENDING_PAYMENT`.
- Conflict toasts: `SLOT_UNAVAILABLE`, `OUTSIDE_POLICY`, `409 CONFLICT`.

### Acceptance

- [ ] Cancel/reschedule from detail updates list without full reload (query invalidation).
- [ ] Past appointments are read-only except “Book again”.
- [ ] IDOR: random uid → not found empty state, no leak.

### Tests

- Playwright cancel happy path; policy violation alert.

---

## T-051 — In-portal booking (reuse SlotPicker)

**Status:** TODO  
**Depends on:** T-050, T-027, T-043  
**Apps:** `apps/client`

### Implementation

- `/portal/book` and `/portal/book/[eventSlug]` within active business; reuse `SlotPicker` with prefilled profile name/email/phone (locked email).
- Submit via authenticated `POST /v1/customer/bookings` + Idempotency-Key.
- Multi-service / add-ons: if EventType supports add-on metadata in schema, collect; else ship **single service** + documented follow-up task hook for add-ons (do not block).
- After book → detail page; paid → checkout redirect (existing billing).

### Acceptance

- [ ] Logged-in customer completes free Intro book without retyping email.
- [ ] Double-submit with same Idempotency-Key returns same booking.
- [ ] Keyboard-only book on mobile viewport.

### Tests

- Extend smoke e2e: customer login → book → appears on home.

---

## T-052 — Reschedule / cancel UX + no-show policy visibility

**Status:** TODO  
**Depends on:** T-050, T-015  
**Apps:** `apps/client`, `apps/api` (policy payload)

### Implementation

- Expose policy fields on customer booking DTO: `cancellationNoticeHours`, `rescheduleNoticeHours`, `noShowPolicySummary`, fee hints if any.
- Cancel sheet: reason optional, show deadline countdown.
- Reschedule: embed SlotPicker; on conflict keep original CONFIRMED (T-015 invariant).
- Host-cancelled / no-show states: explain next steps (rebook, contact business — messaging later).

### Acceptance

- [ ] UI disables cancel when outside policy and explains why.
- [ ] Host no-show status visible on past list.

### Tests

- API unit for DTO; Playwright outside-policy path.

---

## T-053 — Recurring series (customer-facing) — MVP-safe slice

**Status:** TODO  
**Depends on:** T-051, T-014  
**Apps:** `apps/api`, `apps/client`  
**Note:** Full series engine is Phase 2 (`full-scale/03`). This task ships a **thin** customer capability only if product chooses to enable flag `customer_recurring`.

### Implementation

- Flag-gated: book N weekly occurrences (max 12) all-or-nothing; shared `seriesId` on bookings.
- Portal: “Repeats” toggle on book; series detail can cancel **single** vs **this and future** (API must define semantics).
- If flag off: UI hidden; no schema requirement beyond nullable `seriesId`.

### Acceptance

- [ ] Flag off → no recurring UI; existing book path unchanged.
- [ ] Flag on → conflict in any occurrence fails entire batch with clear error.

### Tests

- Unit all-or-nothing; e2e flagged path optional in CI via env.

---

## T-054 — Appointment history, notes & attachments (customer)

**Status:** TODO  
**Depends on:** T-050  
**Apps:** `apps/api`, `apps/client`

### Implementation

- History search by date/service.
- Customer notes: optional private note on booking (`metadata.customerNote`) editable until start.
- Attachments: upload via signed URL to object storage **or** defer binary to “link URL” only if storage not ready — document choice; virus scan hook stub.
- Staff visibility of customer note: complementary toggle in T-079.

### Acceptance

- [ ] Customer can add/edit note before start; locked after.
- [ ] Attachment size/type limits enforced; errors localized.

### Tests

- API validation tests; UI happy path with mock upload.
