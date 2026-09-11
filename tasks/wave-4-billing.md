# Wave 4 — Billing (T-018 … T-024)

**Design:** `docs/design/mvp/05-billing-and-payments.md`, `mvp/14-platform-billing-and-lifecycle.md`  
**App:** `apps/billing` NestJS port **3002**. Shared JWT verify (`JWT_SECRET`). `OrgGuard` duplicated or extracted later — copy the minimal auth middleware (verify JWT + membership via **read** `memberships` table).

Do not put Stripe logic in `apps/api` except HTTP calls to billing `/internal/*`.

---

## T-018 — Billing service skeleton

**Status:** TODO  
**Depends on:** T-003, T-006, T-001  
**Apps:** `apps/billing`

### Implementation

- Nest app, Config zod, helmet, CORS, `/health`, `/metrics` stub, `/v1` prefix, same error envelope.
- `PrismaService` from `@shedflow/db`.
- `PaymentGateway` port + `StripePaymentGateway` using Stripe SDK. Fake `InMemoryPaymentGateway` for tests.
- Raw body for `POST /webhooks/stripe` (`rawBody: true`).
- Internal HMAC guard.
- Turbo `dev` starts billing.
- Client env `BILLING_URL=http://localhost:3002`.

### Acceptance

- [ ] `GET /health` 200.
- [ ] Invalid JWT → 401 envelope.
- [ ] Webhook without signature → 400 (once handler exists in T-019; until then 404 is ok if route reserved).

---

## T-019 — Stripe Connect Express

**Status:** TODO  
**Depends on:** T-018  
**Design:** `05` §2

### Implementation

- Prisma `PlatformAccount`.
- Routes onboard, status, dashboard-link. Pro-gated (`FEATURE_GATED` if FREE).
- Webhook `account.updated` mirrors flags.
- `stripe_events` idempotency.

### Acceptance

- [ ] Fake gateway returns account link URL.
- [ ] Duplicate webhook no double row side effects.
- [ ] FREE org onboard → 403 until T-024; **temporarily allow in test** or mock plan PRO. Document: gate after T-024; for now allow any OWNER so Connect can be dogfooded on FREE in staging if needed. **Product rule: Pro only** — implement the gate reading `organizations.platform_plan`.

---

## T-020 — Product catalog

**Status:** TODO  
**Depends on:** T-019  
**Design:** `05` §3

### Implementation

- Prisma `Product`, `Price`.
- CRUD + Stripe product/price create via gateway. Currency must match org.
- Tests with fake gateway capturing create calls.

### Acceptance

- [ ] Create one-time and recurring product+price; `stripeProductId` stored.
- [ ] Wrong currency → 400.

---

## T-021 — Paid bookings (Checkout + webhooks + revive)

**Status:** TODO  
**Depends on:** T-020, T-014, T-015, T-009  
**Design:** `05` §4, `01` §6.2–6.3

### Implementation

- Prisma `Payment`.
- `POST /internal/checkout-sessions` from api after `PENDING_PAYMENT` insert.
- Public `POST /v1/public/bookings/:uid/checkout` retries session.
- Application fee bps env.
- Webhooks: completed → `payment.succeeded` outbox; worker `booking.confirm`; expired → expire booking; **revive** if paid after EXPIRED (`05` §12).
- Stripe idempotency key `checkout:{bookingId}`.
- Fixtures under `apps/billing/test/fixtures/stripe/`.

### Acceptance

- [ ] Fake: create paid booking → checkout URL returned; simulated webhook → CONFIRMED.
- [ ] Expire job then webhook paid → CONFIRMED (revive).
- [ ] `CONNECT_INCOMPLETE` when charges not enabled.
- [ ] No PAN in logs/DB.

---

## T-022 — Memberships, credits ledger

**Status:** TODO  
**Depends on:** T-021  
**Design:** `05` §5, `credit_balances` table

### Implementation

- Prisma `Subscription`, `StripeCustomer`, `CreditLedgerEntry`, **`credit_balances`**.
- Checkout `mode=subscription`.
- Webhooks subscription/invoice. Credits no rollover (`PERIOD_RESET`).
- `POST /internal/credits/consume|release` with `UPDATE … WHERE balance >= cost`.
- Event types with `creditCost` and `subscriptionProductId`: consume after hold, confirm on success (see `04` §3.1).

### Acceptance

- [ ] Two concurrent consumes with balance 1 → one success.
- [ ] Release after cancel restores balance.
- [ ] New period resets leftover to grant (not additive).

---

## T-023 — Refunds, invoices, dunning email event

**Status:** TODO  
**Depends on:** T-021  
**Design:** `05` §6–§8

### Implementation

- Prisma `Refund`, `Invoice`.
- Refund route OWNER/ADMIN; `refund_application_fee=true`.
- Mirror invoices from webhooks.
- Outbox `invoice.payment_failed` / `payment.refunded` (email in T-025).
- Combined refund+cancel is two client calls (dashboard T-031).

### Acceptance

- [ ] Refund updates payment status; fake Stripe refund called.
- [ ] Invoice upsert from fixture webhook.

---

## T-024 — Platform Free/Pro Checkout

**Status:** TODO  
**Depends on:** T-018, T-006  
**Design:** `mvp/14-platform-billing-and-lifecycle.md`

### Implementation

- `POST /v1/billing/organizations/:id/platform/checkout` `{ interval }`
- `POST …/platform/portal`
- Webhooks on **platform** secret update org via `POST /internal/organizations/:id/plan` on **api** (add this internal route).
- Env `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`.
- Downgrade at period end: `cancel_at_period_end` keeps PRO until webhook says canceled/unpaid.

### Acceptance

- [ ] Fake checkout URL; simulated subscription.created → `platform_plan=PRO`.
- [ ] Event type #4 allowed after PRO.
- [ ] Paid booking on FREE still `FEATURE_GATED`.
