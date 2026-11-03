# Wave 13 — Customer payment receipts (T-061 … T-065)

**Design (historical):** `mvp/05-billing-and-payments.md`, `mvp/14-platform-billing-and-lifecycle.md`  
**Product change (current):** **No Stripe Customer Portal, cards, memberships, packages, or gift cards for now.** Customers see **payment-receipt submissions** tied to their bookings (upload status, staff decision). Staff receipt config/review lives in Wave 4 (`shedflow-back`).  
**Backend of record:** Laravel `shedflow-back`.  
**Does not duplicate:** T-018–T-023 staff receipt config/review; T-015 signed manage links.

**Supersedes:** Stripe invoices list, Billing Portal for cards, subscription/credit balances, punch cards, gift cards.

---

## T-061 — Customer receipt submissions list (API + UI)

**Status:** TODO  
**Depends on:** T-042, T-020 (receipt upload on book), T-046  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- `GET /v1/customer/payment-receipts` (or `/v1/customer/bookings?hasReceipt=1`) scoped to linked Customer ids — list booking uid, org, amount/instructions snapshot if stored, receipt status (`UPLOADED` | `APPROVED` | `REJECTED`), timestamps, rejection reason.
- Detail: link to appointment; optional re-upload CTA when rejected and policy allows (Wave 4).
- UI `/portal/payments`: mobile list of receipt/payment-confirmation items (**not** Stripe invoices). Empty state explains offline/bank transfer confirmation via receipt.
- No PAN, no Stripe ids in payloads.

### Acceptance

- [ ] Seed/fixture booking with receipt appears for customer after upload.
- [ ] IDOR across customers blocked.
- [ ] Approved/rejected statuses visible without staff JWT.

### Tests

- Feature list + Playwright portal payments list (or documented until seed T-044).

---

## T-062 — Payment methods / Stripe Customer Portal — CANCELLED

**Status:** CANCELLED (deferred)  
**Depends on:** —  
**Apps:** was `apps/billing`

### Scope (do not implement now)

`POST /v1/customer/billing/portal-session`, SetupIntent, “Manage cards”, Connect-gated card vault — **deferred** with full Stripe gateway.

### Acceptance

- [x] No customer card-vault routes required in `shedflow-back`.
- [x] Portal “Manage cards” hidden or shows deferred empty state.

---

## T-063 — Memberships, subscriptions & credit balances — CANCELLED

**Status:** CANCELLED (deferred)  
**Depends on:** —  

### Scope (do not implement now)

Customer memberships, `credit_balances`, subscribe/cancel via Checkout — **deferred**. Portal `/portal/memberships` hidden or “Coming later”.

### Acceptance

- [x] No credit ledger APIs required for current MVP.
- [ ] (Future) Reintroduce without removing receipt confirmation.

---

## T-064 — Packages / punch cards — CANCELLED

**Status:** CANCELLED (deferred)  
**Depends on:** —  

### Scope (do not implement now)

Prepaid packages / punch cards via Checkout — **deferred**.

### Acceptance

- [x] Out of scope for receipt-confirmation MVP.

---

## T-065 — Gift cards & store credit — CANCELLED

**Status:** CANCELLED (deferred)  
**Depends on:** —  
**Flag (historical):** `customer_gift_cards`

### Scope (do not implement now)

Gift card redeem → store credit — **deferred**. Flag stays off; no routes.

### Acceptance

- [x] Flag off / no gift-card routes in `shedflow-back`.
