# MVP 14 — Platform billing and customer lifecycle

How **SchedFlow charges businesses** (not how businesses charge invitees — that is `05`).

## 1. Plans

| | Free | Pro |
| --- | --- | --- |
| Price | $0 | $29 / month or $290 / year (env Stripe prices; change without code) |
| Event types | 3 | unlimited |
| Members | 1 | unlimited |
| Calendar (Google) | yes | yes |
| Outlook | no | flag |
| Paid bookings, Connect, memberships | no | yes |
| Branding / hide badge | no | yes |
| API + webhooks | no | yes |
| Application fee on Connect | n/a | `STRIPE_PLATFORM_FEE_BPS` (200 = 2%) |

Limits enforced in `FeatureGuard` / service layer, not only UI.

## 2. Lifecycle

```
register → FREE org
  → (optional) POST /v1/billing/organizations/:id/platform/checkout { interval: 'month'|'year' }
  → Stripe Checkout (platform account)
  → webhook customer.subscription.created/updated
  → api internal: platformPlan=PRO, store stripe customer/subscription ids
  → use Pro features
  → cancel at Stripe Customer Portal (POST .../platform/portal → url)
  → subscription.deleted or cancel_at_period_end: remain PRO until period end, then FREE
  → over-limit event types remain but cannot create new; paid event types stop accepting paid bookings (`FEATURE_GATED`)
```

Trial: **none** in MVP (can set Stripe trial later via price).

Failed platform payment: Stripe retries; we email; after Stripe marks unpaid, downgrade to FREE.

## 3. Application fee

Only on **connected-account** charges (bookings and memberships). Not on platform Pro subscription. Shown in Connect onboarding copy: “SchedFlow adds a 2% application fee.”

## 4. Self-serve vs sales

MVP is 100% self-serve. No invoiced enterprise, no annual contracts except the yearly Stripe price.

## 5. Onboarding (product)

See `08` checklist. Activation metric: first `booking.confirmed`. Secondary: Connect complete.

## 6. Delinquent / abuse

- Rate limits.
- Platform admin can `DISABLED` membership / `deletedAt` org.
- No automatic fraud ML.

## 7. Accounting

Stripe reports are the books. We do not implement tax invoices for Pro beyond Stripe-hosted invoices. `invoices` table is for **connected** customer invoices; platform invoices can be listed via Stripe Dashboard or a simple `GET /v1/billing/.../platform/invoices` proxy later — **optional**, not launch-blocking.

## 8. Migration to Phase 2

Plan families, add-ons (SMS packs), usage-based API, sales-assisted, multiple entities — `full-scale/10-platform-billing-ops-tooling.md`.
