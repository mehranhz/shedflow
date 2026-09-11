# Full-scale 10 — Platform billing and ops tooling

## 1. Monetisation

- Plan families: Free, Pro, Business, Enterprise (custom).
- Add-ons: SMS packs, custom domain, SSO, HIPAA isolation (if ever).
- Usage: API calls overage, webhook storms.
- Application fee declining with volume.
- Sales-assisted annual invoices (Stripe Invoicing / Bill.com) with Entitlements still sourced from one service.

## 2. Entitlements service

`Check(org, feature) → allow`. Cached 30 s. Source of truth: Stripe + overrides (comps, trials, enterprise contracts). Feature flags **compose** with entitlements (flag off beats plan).

## 3. Ops tooling

- Internal admin app: impersonate (step-up), view outbox, replay webhooks, refund, GDPR trigger, shadow a tenant.
- Support macros, Intercom/Zendesk SSO.
- Audit every impersonation (already in MVP T-038, expanded).

## 4. Customer lifecycle

PLG: activation (first confirmed booking), conversion (Pro), expansion (seats, usage). Data in warehouse. Churn: cancellation survey, pause instead of cancel.

## 5. From MVP

`platformPlan` enum dies; replaced by entitlement records. Dual-read during migration.
