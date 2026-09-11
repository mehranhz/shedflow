# MVP 05 — Billing, subscriptions, payments, PCI

**Service:** `apps/billing` (NestJS, port 3002).  
**PSP:** Stripe. Card data never touches SchedFlow (Checkout / Elements / Connect hosted onboarding). PCI scope = **SAQ A**.

Two money flows, never mixed:

1. **Platform billing** — SchedFlow charges the organization (Free/Pro). Stripe Billing on the **platform** account.
2. **Commerce billing** — The organization charges its customers. Stripe **Connect Express**. SchedFlow takes an application fee.

## 1. Ports (vendor-swappable)

```ts
abstract class PaymentGateway {
  abstract createConnectAccount(org: { id: string; email: string }): Promise<{ stripeAccountId: string }>;
  abstract createAccountLink(stripeAccountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>;
  abstract retrieveAccount(stripeAccountId: string): Promise<ConnectStatus>;
  abstract createCustomer(params: StripeCustomerParams): Promise<{ stripeCustomerId: string }>;
  abstract createCheckoutSession(params: CheckoutParams): Promise<{ id: string; url: string }>;
  abstract expireCheckoutSession(id: string): Promise<void>;
  abstract createRefund(paymentIntentId: string, amountMinor: number, reason?: string): Promise<{ id: string }>;
  abstract createProduct(params): Promise<{ id: string }>;
  abstract createPrice(params): Promise<{ id: string }>;
  abstract constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event;
}
```

Only `StripePaymentGateway` in MVP. Unit tests fake the port.

## 2. Connect onboarding (Pro)

```
POST /v1/billing/organizations/:orgId/connect/onboard → { url }
GET  /v1/billing/organizations/:orgId/connect/status  → { chargesEnabled, payoutsEnabled, detailsSubmitted }
POST /v1/billing/organizations/:orgId/connect/dashboard-link → { url }  // Stripe Express dashboard
```

- Account type: **Express**.
- `metadata.organizationId` on the Stripe account.
- Webhook `account.updated` mirrors flags onto `platform_accounts`.
- Paid event types and checkout **require** `chargesEnabled`. Else `422 CONNECT_INCOMPLETE`.
- Country: start with `US`, `CA`, `GB`, `AU`, `IE`, `DE`, `FR`, `NL`, `ES`, `IT`. Reject others with a clear error until we expand.

## 3. Catalog

Organizations create products that are mirrored to the **connected account**.

```
GET/POST  /v1/billing/organizations/:orgId/products
PATCH     /v1/billing/organizations/:orgId/products/:id
POST      /v1/billing/organizations/:orgId/products/:id/prices
```

| Field | One-time (session fee) | Recurring (membership) |
| --- | --- | --- |
| `type` | `ONE_TIME` | `RECURRING` |
| Price `interval` | null | `month` or `year` |
| `creditGrantPerPeriod` | 0 | N sessions (integer) |

Amount in org currency only (MVP: one currency per org, default USD). Stripe Tax: `automatic_tax[enabled]=true` on Checkout if `org.settings.stripeTax === true` (toggle in dashboard). We do **not** compute tax ourselves.

Event types reference `priceId` (one-time) and/or `subscriptionProductId` + `creditCost`.

Deactivating a product sets `isActive=false` and `stripe.products.update({ active: false })`. Existing prices are not deleted (Stripe forbids deleting prices in use).

## 4. Pay-per-booking Checkout

Internal: `POST /internal/checkout-sessions`

```ts
{
  organizationId: string;
  bookingId: string;
  customerId: string;
  priceId: string;
  invitee: { email: string; name: string };
  successUrl: string; // APP_URL/b/{uid}/success?session_id={CHECKOUT_SESSION_ID}
  cancelUrl: string;
  expiresAt: string;  // = booking.holdExpiresAt
}
```

Stripe session:

- `mode: 'payment'`
- `line_items: [{ price: stripePriceId, quantity: 1 }]`
- `customer_email` or existing `stripe_customers` on the connected account
- `payment_intent_data.application_fee_amount` = `floor(amountMinor * STRIPE_PLATFORM_FEE_BPS / 10000)` (default 200 = 2%)
- `stripeAccount` header = connected account
- `metadata: { organizationId, bookingId, customerId, kind: 'booking' }`
- `expires_at` unix = hold

Insert `payments` row `REQUIRES_PAYMENT`. Return `{ url, paymentId }`. Api stores `bookings.payment_id`.

### Webhooks (connected-account events — use the Connect webhook secret)

| Event | Action |
| --- | --- |
| `checkout.session.completed` | If `kind=booking` and payment_status paid: payment `SUCCEEDED`; outbox `payment.succeeded`. Worker confirms booking. |
| `checkout.session.expired` | payment `CANCELED`; outbox `payment.expired`. Worker expires booking if still pending. |
| `payment_intent.payment_failed` | payment `FAILED`; outbox `payment.failed` (dunning email — rare for Checkout). |
| `charge.refunded` | see refunds |

Idempotency: insert `stripe_events` with PK = event id **first**. If conflict, return 200 immediately. Process after insert. Handler must be retry-safe.

## 5. Membership subscriptions (customer → organization)

Checkout `mode: 'subscription'` on the connected account, `subscription_data.application_fee_percent` = `STRIPE_PLATFORM_FEE_BPS / 100` (2.0). Metadata `kind: 'membership'`, `productId`, `customerId`.

Webhooks:

| Event | Action |
| --- | --- |
| `customer.subscription.created/updated` | Upsert `subscriptions`, mirror status and period. |
| `invoice.paid` | Upsert `invoices`; if subscription: `GRANT` credits (`creditGrantPerPeriod`) for `[periodStart, periodEnd)`; outbox `subscription.renewed`. |
| `invoice.payment_failed` | status `PAST_DUE`; outbox `invoice.payment_failed` (dunning email). |
| `customer.subscription.deleted` | status `CANCELED`; do not claw back unused credits already granted this period. |

### Credits ledger

Append-only. Balance = last `balanceAfter` for `(org, customer)` or `SUM(delta)` (use last row + unique sequential insert).

Consume (`POST /internal/credits/consume`):

```
BEGIN
  SELECT last balance FOR UPDATE (on a credits_lock row per org+customer — or transactional advisory lock)
  if balance < cost → 422
  INSERT delta=-cost, reason=CONSUME, bookingId
COMMIT
```

Without a lock table, use:

```sql
CREATE TABLE credit_balances (
  organization_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  balance INT NOT NULL,
  PRIMARY KEY (organization_id, customer_id)
);
```

Update `balance = balance - cost WHERE balance >= cost` — 0 rows means insufficient. Then insert ledger row. This is the **required** implementation (avoid lost updates).

Release: `delta=+cost`, `RELEASE`, only if a `CONSUME` exists for that booking and no `RELEASE` yet.

Period reset: on `invoice.paid` for a new period, set balance to `creditGrantPerPeriod` (**not** additive). Insert `PERIOD_RESET` with `delta = grant - previousBalance` (may be negative if they had leftover — leftover dies; this is the documented MVP policy: **credits do not roll over**).

## 6. Refunds

```
POST /v1/billing/organizations/:orgId/payments/:id/refunds
{ "amountMinor"?: number, "reason"?: string }
```

OWNER/ADMIN. Stripe `refunds.create` on the connected account. Partial allowed. Status `PARTIALLY_REFUNDED` / `REFUNDED`. Outbox `payment.refunded`. Does **not** auto-cancel the booking; the dashboard offers a combined "Refund and cancel" that calls both APIs.

Platform application fee: Stripe refunds the fee proportionally when we refund via the Charge (`refund_application_fee=true`). Set that flag.

## 7. Invoices

Mirrored from Stripe for the connected account (`invoice.paid`, `invoice.finalized`). Dashboard lists them with links to `hosted_invoice_url`. We do not generate PDFs.

## 8. Dunning

Stripe Smart Retries on the connected account (enabled in Stripe Dashboard / account config). We only send the email on `invoice.payment_failed` and `invoice.paid` (receipt). No custom retry engine in MVP.

## 9. Platform plans (SchedFlow → organization)

See `14-platform-billing-and-lifecycle.md`. Implemented in the same billing service, **platform** Stripe account (no Connect header). Prices from env `STRIPE_PRICE_PRO_MONTHLY` / `YEARLY`. Checkout `mode=subscription`, `client_reference_id=organizationId`. Webhook `customer.subscription.*` updates `organizations.platform_plan` via `POST /internal/organizations/:id/plan` on api (api owns the column) **or** billing writes the column as an allowed exception documented in architecture §8 — **prefer internal HTTP** to keep write ownership.

## 10. Tax

- Platform: Stripe Tax on platform Checkout if `STRIPE_TAX=true`.
- Connected: optional per org. We never store tax rates. SAQ A unaffected.

## 11. PCI & secrets

- No card fields in our DOM except Stripe.js iframe (Checkout is a redirect — even simpler).
- Raw webhook body required: disable Nest JSON parser on `/webhooks/stripe` (`rawBody: true` in `NestFactory.create`).
- `STRIPE_SECRET_KEY`, webhook secrets in env / Fly secrets. Never log request bodies of webhooks beyond `event.id` + `type`.
- Idempotency keys on Stripe writes: `Idempotency-Key: checkout:{bookingId}`.

## 12. Failure modes

| Failure | Handling |
| --- | --- |
| Stripe timeout on create session | 502; booking remains PENDING_PAYMENT; client retries `/checkout` |
| Webhook delayed | Hold lasts 15 m; if webhook arrives after expiry, confirm only if booking still PENDING_PAYMENT **or** if EXPIRED and payment succeeded → **revive** to CONFIRMED (job `booking.revive`) — **must implement** to avoid taking money without a booking |
| Duplicate webhook | `stripe_events` PK |
| Connect account disabled | Checkout fails; surface `CONNECT_INCOMPLETE` |
| Currency mismatch | Reject price create if ≠ org.currency |

## 13. Test mode

Stripe test keys in `.env`. Use `stripe listen --forward-to localhost:3002/webhooks/stripe`. Fixtures in `apps/billing/test/fixtures/stripe/*.json`. Never hit live Stripe in CI; use a fake `PaymentGateway`.

## 14. Out of scope

Invoices authored by us, ACH/SEPA custom flows (Checkout may still offer them if Stripe enables), crypto, multiple connected accounts per org, destination charges vs direct (we use **direct charges** on the connected account with application fee).
