# Wave 4 — Payment receipt confirmation (T-018 … T-024)

**Design (historical):** `docs/design/mvp/05-billing-and-payments.md`, `mvp/14-platform-billing-and-lifecycle.md`  
**Product change (current):** **No Stripe / payment gateway for now.** Admins configure an optional **payment-receipt confirmation** step on event types. Invitees must **upload a payment receipt** before (or as part of) booking submission; staff review the receipt and confirm or reject the booking.  
**Backend of record:** Laravel `shedflow-back` (Nest `apps/billing` + Stripe Connect work is **obsolete / deferred**).  
**Frontend:** `shedflow/apps/client` (staff dashboard + public booking).

**Supersedes:** Original Nest billing service (port 3002), Stripe Connect Express, Checkout, Products/Prices, credits ledger, platform Pro Checkout, and refund webhooks.

**Already in Laravel (do not redo):** `EventType.requires_confirmation`, booking statuses including `PENDING_PAYMENT` / `PENDING_CONFIRMATION`, host `confirm` / `cancel` / `no-show`, public booking create. **Missing:** receipt flag, upload storage, receipt review APIs, public upload UX.

---

## T-018 — Event type: require payment receipt (admin config)

**Status:** DONE  
**Depends on:** T-011 (Laravel event types exist in `shedflow-back`)  
**Apps:** `shedflow-back`, `apps/client`

### Goal

Admins can toggle a confirmation step that requires a payment receipt upload for an event type — without any payment gateway.

### Implementation

- Migration on `event_types` in `shedflow-back`:
  - `requires_payment_receipt` boolean default `false` (API camelCase `requiresPaymentReceipt`).
  - Optional copy fields: `payment_instructions` (text/nullable) — shown to invitees (bank details, amount hint, etc.). Amount remains free-text / instructions only (no integer money ledger required in this wave).
- When `requires_payment_receipt=true`, booking create must not finalize as `CONFIRMED` until a receipt is present **and** staff approve (see T-020/T-021). Interaction with existing `requires_confirmation`:
  - **Documented choice (two-step):** receipt required ⇒ `PENDING_PAYMENT` until receipt uploaded, then `PENDING_CONFIRMATION` until staff approve (implemented in T-020/T-021).
  - If only `requires_confirmation` (no receipt): keep current Laravel behaviour (`PENDING_CONFIRMATION`).
- Update `EventType` model, FormRequests, `EventTypeResource`, seed/factory.
- Dashboard event type form: replace Stripe `priceId` / Connect gating with **Require payment receipt** switch + instructions textarea. Hide/remove Stripe catalog fields from admin UI (or leave disabled “Coming later”).

### Acceptance

- [x] OWNER/ADMIN can enable `requiresPaymentReceipt` on an event type via API + dashboard.
- [x] Public event-type payload exposes the flag + instructions (no secrets).
- [x] MEMBER cannot change org billing/receipt settings if RBAC already forbids event-type write — follow existing host-scoped EventTypeService RBAC (MEMBER may only update own hosted event types; others → 404).

### Tests

- Feature: store/update event type with flag; public show includes flag.

---

## T-019 — Receipt storage + booking attachment model

**Status:** DONE  
**Depends on:** T-018  
**Apps:** `shedflow-back`

### Implementation

- Table `booking_payment_receipts` (UUID PK):
  - `booking_id`, `organization_id`, `uploaded_by_user_id` (nullable for guest), `disk`, `path`, `original_filename`, `mime_type`, `size_bytes`, `status` (`UPLOADED` | `APPROVED` | `REJECTED`), `reviewer_user_id`, `reviewed_at`, `rejection_reason`, timestamps.
- Store files via Laravel filesystem (`local` in dev, S3-compatible in prod). MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max size e.g. 5 MB.
- Never log file bytes; signed/temporary download URLs for staff only.
- Optional: soft-delete / replace previous receipt on re-upload while `PENDING_*`.

### Acceptance

- [x] Upload persists metadata row + file on disk.
- [x] Disallowed MIME / oversized → 422 validation.
- [x] IDOR: org A staff cannot fetch org B receipt.

### Tests

- Feature upload + download authz; validation matrix.

---

## T-020 — Public / authenticated book requires receipt upload

**Status:** DONE  
**Depends on:** T-019, T-014 (Laravel bookings)  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- Public booking flow when `requiresPaymentReceipt`:
  1. Create booking in `PENDING_PAYMENT` (slot held; `hold_expires_at` = **30 minutes**).
  2. Two-step: create booking → `POST /v1/public/bookings/{uid}/payment-receipt` with **manage** action token (+ multipart `file`).
  3. After successful upload → `PENDING_CONFIRMATION`; slot stays occupied; hold cleared.
- Upload without file → 422. Create alone never yields `CONFIRMED` for receipt-required types.
- Guest auth: verified phone required on public book; `uploaded_by_user_id` set when JWT user present.
- Client Stripe checkout strip deferred to T-022.

### Acceptance

- [x] Book without receipt on receipt-required type → no CONFIRMED row (`PENDING_PAYMENT`); upload without file → 422.
- [x] Book + upload → `PENDING_CONFIRMATION` and slot unavailable.
- [x] Non-receipt event types unchanged (auto-confirm or `requiresConfirmation` only).
- [x] Hold expiry frees slot and marks booking `EXPIRED`.

### Tests

- Feature: receipt-required happy path; missing receipt; expire hold.

---

## T-021 — Staff review: approve / reject receipt

**Status:** DONE (API); dashboard UI polish → T-022  
**Depends on:** T-020  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- Routes under org bookings (JWT + membership):
  - `GET …/bookings/{booking}/payment-receipt` (metadata + temporary URL)
  - `POST …/bookings/{booking}/payment-receipt/approve` → booking `CONFIRMED`, receipt `APPROVED` (idempotent if already approved)
  - `POST …/bookings/{booking}/payment-receipt/reject` `{ reason }` → receipt `REJECTED`; booking back to **`PENDING_PAYMENT` with fresh 30m hold** for re-upload.
- Public `GET /bookings/{uid}` includes `paymentReceipt` status + `rejectionReason` (no download URL).
- Dashboard booking detail Approve/Reject UI → T-022.
- Notifications → T-023.

### Acceptance

- [x] Approve confirms booking; public manage payload shows CONFIRMED.
- [x] Reject with reason visible to invitee; staff reason required.
- [x] MEMBER limited to own host bookings (match `BookingService` RBAC).

### Tests

- Feature approve/reject + policy IDOR.

---

## T-022 — Hosted booking + dashboard UX for receipts

**Status:** DONE  
**Depends on:** T-021, T-027 patterns  
**Apps:** `apps/client`

### Implementation

- Public `[orgSlug]/[eventSlug]`: if `requiresPaymentReceipt`, show payment instructions + file input before submit (or post-create upload screen). No Stripe redirect.
- Success/manage pages: receipt status (`uploaded` / `pending review` / `rejected` + reason).
- Dashboard: event type toggle (T-018); bookings sheet review UI (T-021).
- Remove or gate dead Stripe Connect / Pro checkout CTAs that assume `apps/billing` (mark “deferred” empty state).

### Acceptance

- [x] Mobile-friendly upload on public booking (390px).
- [x] Keyboard accessible file picker + submit.
- [x] Staff can complete approve without leaving bookings UI.

### Tests

- Playwright (or documented manual until T-037 portal): free book unchanged; receipt-required book → pending → staff approve.

---

## T-023 — Receipt decision notifications

**Status:** DONE  
**Depends on:** T-021, T-025 patterns  
**Apps:** `shedflow-back` (Notifications / SmsChannel), optional `apps/client` copy

### Implementation

- On upload: notify host/staff (SMS and/or email when mailer exists).
- On approve/reject: notify invitee with manage/portal link.
- Reuse `SmsChannel` patterns from org invitations; log sends. No Stripe receipt emails.

### Acceptance

- [x] Approve/reject triggers invitee notification in dev (logged or SMS fake).
- [x] Duplicate approve is idempotent (already CONFIRMED → no-op / 409).

### Tests

- Notification fake assertion on approve/reject.

---

## T-024 — Stripe Connect / platform Pro Checkout — DEFERRED

**Status:** CANCELLED (deferred)  
**Depends on:** —  
**Apps:** was Nest `apps/billing`

### Scope (do not implement now)

Original Nest tasks (Connect Express, catalog, Checkout webhooks, credits, refunds, platform Free/Pro Stripe prices) are **out of scope**. Keep design docs for a future wave; do not block launch on Stripe.

### Acceptance

- [x] No new Stripe SDK / webhook routes required in `shedflow-back` for MVP receipt flow.
- [x] Task file and README state gateway work is deferred.
- [ ] (Future) Reintroduce gateway behind a feature flag without removing receipt flow.
