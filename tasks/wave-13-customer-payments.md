# Wave 13 — Customer payments, memberships & packages (T-061 … T-065)

**Design:** `mvp/05-billing-and-payments.md`, `mvp/14-platform-billing-and-lifecycle.md` (contrast: this wave is **invitee** money, not SchedFlow Pro)  
**Goal:** Let customers see and mutate payment methods, invoices, credits, memberships/packages/punch cards via Stripe Customer Portal / Checkout — never PAN on SchedFlow.  
**Does not duplicate:** T-018–T-024 staff billing dashboard; T-021 checkout for guest paid book.

---

## T-061 — Payments & receipts list (customer API + UI)

**Status:** TODO  
**Depends on:** T-042, T-021, T-023, T-046  
**Apps:** `apps/api`, `apps/billing`, `apps/client`

### Implementation

- `GET /v1/customer/payments` / `…/invoices` scoped to linked Customer ids (all businesses or active org).
- Show amount (minor units + currency), status, booking link, receipt/hosted invoice URL from Stripe mirror.
- Refunds: **visibility only** (status/amount/date); customers cannot self-refund.
- UI `/portal/payments` mobile list + detail sheet.

### Acceptance

- [ ] Paid coaching fixture (or fake gateway) appears for seed customer after payment webhook.
- [ ] No Stripe secret keys or PAN in client payloads.
- [ ] IDOR across customers blocked.

### Tests

- Billing fake gateway fixture → customer list e2e.

---

## T-062 — Payment methods on file (Stripe Customer Portal)

**Status:** TODO  
**Depends on:** T-061, T-019  
**Apps:** `apps/billing`, `apps/api`, `apps/client`

### Implementation

- `POST /v1/customer/billing/portal-session` `{ organizationId, returnUrl }` → Stripe Billing Portal / Customer Portal URL for the connected-account `StripeCustomer`.
- UI button “Manage cards” opens portal; return to `/portal/payments/methods`.
- If no StripeCustomer yet, start SetupIntent / Checkout setup mode.
- Feature gate: org must have Connect charges enabled.

### Acceptance

- [ ] Fake gateway returns portal URL; client redirects.
- [ ] `CONNECT_INCOMPLETE` surfaced as friendly empty state.
- [ ] Idempotent session create with Idempotency-Key.

### Tests

- Unit gateway; client redirect smoke with mocked URL.

---

## T-063 — Memberships, subscriptions & credit balances

**Status:** TODO  
**Depends on:** T-061, T-022  
**Apps:** `apps/api`, `apps/billing`, `apps/client`

### Implementation

- `GET /v1/customer/memberships` — status, period, cancel_at_period_end, credit balance, product name.
- Actions: subscribe (Checkout), cancel at period end, reactivate (via portal or API).
- UI `/portal/memberships`: balance ring/progress for credits; “Book using credits” CTA to eligible event types.
- Consume path already in T-022 — portal book must pass subscription context.

### Acceptance

- [ ] Customer sees credit balance matching `credit_balances`.
- [ ] Cancel at period end reflects on next GET after webhook.
- [ ] Concurrent credit consume still safe (reuse T-022 tests from portal auth).

### Tests

- E2e subscription fake + portal list.

---

## T-064 — Packages / punch cards

**Status:** TODO  
**Depends on:** T-063  
**Apps:** `packages/db`, `apps/billing`, `apps/api`, `apps/client`

### Implementation

- Product type or metadata for **prepaid package** (N credits, non-recurring) distinct from membership period reset.
- Purchase via Checkout; grant ledger entries; expiry optional.
- Portal UI: punch card progress (“3 of 10 remaining”).
- Staff catalog UI may be minimal API-only if dashboard already has products (T-032) — add type field if missing.

### Acceptance

- [ ] Buying package increases balance by N; booking decrements; no period auto-reset.
- [ ] Expired package cannot be consumed (`PACKAGE_EXPIRED`).

### Tests

- Ledger unit tests; e2e purchase→book.

---

## T-065 — Gift cards & store credit (optional scope gate)

**Status:** TODO  
**Depends on:** T-064  
**Apps:** `apps/billing`, `apps/api`, `apps/client`  
**Flag:** `customer_gift_cards`

### Implementation

- If flag off: task documents out-of-scope UI hidden; mark acceptance as N/A for runtime.
- If flag on: gift card codes redeem → store credit ledger; customer redeem UI; abuse rate limits.

### Acceptance

- [ ] Flag off → no routes registered or 404.
- [ ] Flag on → redeem happy path + double-redeem rejected.

### Tests

- Flag matrix unit tests.
