# Full-scale 04 — Billing, payments, PCI

## 1. Stay out of PAN scope

Stripe remains the only card processor. **No** storing PAN, **no** self-hosted checkout fields except Stripe.js. SAQ A retained. "PCI DSS Level 1" in company marketing means: we meet obligations of a large Stripe Connect platform (security reviews, Connect dashboard, vulnerability scans), **not** that we run a cardholder data environment.

## 2. Ledger

Internal **double-entry** for application fees, refunds, disputes:

```
accounts: platform_cash, connected_payable, revenue_fee, refunds_contra
```

Every Stripe webhook posts journal entries (idempotent by event id). This is for our finance, not for charging cards.

Disputes: `charge.dispute.created` → freeze payout notes, notify org, Temporal evidence pack.

## 3. Proration / plan families

Platform: Stripe Subscriptions with multiple prices, coupons, grandfathers. Entitlements service maps `priceId` → features (not a boolean FREE/PRO).

Org commerce: plan families (Basic/Plus membership), upgrades via Stripe Subscription `update` with `proration_behavior`. Credits: rollover policy per product (MVP was no rollover).

## 4. Tax

Stripe Tax + org address. Multiple entities: one connected account per legal entity (product change). We still do not compute tax.

## 5. Payouts

Express remains default. Custom Connect for enterprise. Instant payouts as a flag.

## 6. Dunning

Stripe Smart Retries + Revenue Recovery. In-app banners from `PAST_DUE`. Pause entitlements after N days (config).

## 7. Idempotency & poison webhooks

Exactly-once **effects** via `stripe_events` processed flag + ledger unique `stripe_event_id`. Dead-letter Kafka topic. Replay tool in ops UI.

## 8. Migration from MVP `apps/billing`

Keep the Nest app; split Catalog vs Ledger vs Connect only when teams diverge. Introduce journal table **before** splitting DBs. Direct charges stay; destination charges if we need platform-level payment method reuse (rare).
