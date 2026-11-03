# Wave 10 — Mobile customer shell & design system (T-045 … T-048)

**Design:** `mvp/08-frontend.md` (patterns only — **new** portal IA), `mvp/15-i18n-a11y-compliance.md`  
**Goal:** Ship a **mobile-first** customer portal chrome distinct from the staff sidebar dashboard. Desktop is a responsive widening of the same composition, not a second IA.  
**Backend:** portal APIs on Laravel `shedflow-back` (not Nest). **Payments tab** = Wave 13 receipt status list (T-061) — **no Stripe** Customer Portal / Checkout.  
**Does not duplicate:** T-029 staff `AppSidebar`, T-027 public booking chrome, T-028 embed.

---

## T-045 — Portal route group, auth gates, reserved paths

**Status:** DONE  
**Depends on:** T-041, T-029  
**Apps:** `apps/client`

### Implementation

- Add App Router group `app/(portal)/` with prefix `/portal`:
  - `/portal` home, `/portal/login`, `/portal/register`, `/portal/claim`, `/portal/appointments`, `/portal/account`, …
- **Reserve** portal path segments so they are **not** captured by `[orgSlug]` (middleware or explicit static segments — today `/portal` incorrectly renders as an org slug page).
- `proxy.ts` / middleware: protect `/portal/*` except login/register/claim; redirect staff-only users who land on portal with a clear “Business dashboard” link.
- BFF: reuse `/api/bff/api/...` with customer Bearer; add `X-Customer-Org-Id` forwarding from `sf_customer_org` cookie.
- Post-login routing: memberships → `/dashboard`; customer links only → `/portal`; both → chooser interstitial once.

### Acceptance

- [x] `/portal` is never handled by `[orgSlug]` (200 portal shell or login, not empty org page titled “portal”).
- [x] Unauthenticated `/portal/appointments` → `/portal/login?next=…`.
- [x] Seed customer reaches portal home after login.

### Tests

- Playwright: reserved path; auth redirect; owner visiting `/portal` sees chooser or CTA without staff data leak.

---

## T-046 — Mobile shell: bottom nav, headers, empty/error/loading

**Status:** DONE  
**Depends on:** T-045  
**Apps:** `apps/client`, `packages/ui`

### Implementation

- `PortalShell`: sticky top bar (active business name + avatar), **bottom tab bar** on `<md` (Home, Appointments, Payments→receipt list T-061, Account), side nav optional on desktop.
- Business switcher sheet (data from T-042).
- Shared states: `PortalSkeleton`, empty illustrations, destructive `Alert` + retry, offline banner stub (wire in T-078).
- Touch targets ≥ 44px; safe-area insets for notched phones.
- shadcn only; add missing primitives to `@shedflow/ui` (e.g. `drawer` if needed for switcher).
- Dark-mode: follow existing CSS variables; do not invent a new purple theme.

### Acceptance

- [x] Primary actions reachable one-handed on 390×844 viewport.
- [x] Keyboard: tab order through bottom nav; skip link to main.
- [x] Loading → empty → error paths shown in Storybook or documented fixture pages.

### Tests

- Playwright mobile project (Pixel 5 / iPhone) smoke on shell; axe on `/portal` (serious/critical fail).

---

## T-047 — Design tokens, branding inheritance, i18n hooks

**Status:** DONE  
**Depends on:** T-046, T-039  
**Apps:** `apps/client`, `packages/ui`

### Implementation

- Portal theming: when an active business is selected, apply org `--brand` / `--brand-foreground` (luminance rules from T-039) on portal chrome without breaking SchedFlow marketing pages.
- next-intl message namespaces: `portal.*` (en + stub second locale if registry already supports it).
- Analytics event map (client): `portal_view`, `portal_book_start`, `portal_cancel`, `portal_receipt_upload` — fire via existing analytics hook or no-op collector; **no invitee PII** in payloads (`mvp/10`). No Stripe `portal_pay` / Checkout events.
- Document IA in `docs/design/` short addendum or task-only ASCII route map in this file (no Phase-2 full-scale rewrite required).

### Portal IA (route map)

```
/portal                    home (upcoming)
/portal/login|register|claim
/portal/choose             dual-role interstitial
/portal/appointments       list
/portal/appointments/:uid  detail (auth)
/portal/payments           receipt status list (T-061)
/portal/account            profile / sign-out
/portal/offline            offline shell stub
/b/:uid/manage?token=      guest manage (signed; upgrade banner → register/claim)
/b/:uid/pay                receipt upload (transfer instructions)
```

### Acceptance

- [x] Switching business updates brand color on shell within one navigation.
- [x] All new strings go through next-intl (no hardcoded English in components).
- [x] Analytics events omit email/name/phone.

### Tests

- Unit: luminance helper reuse (`lib/event-colors.test.ts`); analytics PII strip + message keys (`lib/portal/analytics.test.ts`).

---

## T-048 — Deep links from email & manage-page upgrade path

**Status:** DONE  
**Depends on:** T-046, T-043, T-025  
**Apps:** `apps/client`, `shedflow-back` (notifications / Mailables when Wave 5 ported)

### Implementation

- Email/SMS CTAs: primary “Manage in SchedFlow” → `/portal/appointments/:uid` (auth or claim), secondary keep signed `/b/:uid/manage?token=`.
- Manage page guest UI: banner “Create a free account to see all your appointments” → claim/register with email/phone prefilled.
- Universal links / path contract documented for future native apps (HTTPS URLs only in this wave).
- Nest `packages/emails` / `apps/worker` are historical — implement sends via Laravel when available.

### Deep-link / universal-link contract (HTTPS only)

| Intent | Path | Auth |
| --- | --- | --- |
| Portal appointment | `{FRONTEND}/portal/appointments/{uid}` | Customer session or claim/login with `?next=` |
| Guest manage | `{FRONTEND}/b/{uid}/manage?token={manage}` | Signed action token |
| Receipt upload | `{FRONTEND}/b/{uid}/pay?token={manage}` | Signed manage token |
| Claim account | `{FRONTEND}/portal/claim?token=` or `?email=` | One-time claim token / email |

Feature flag: Laravel `features.customer_portal` (`CUSTOMER_PORTAL`, default on when `APP_ENV=local`). Client: `NEXT_PUBLIC_CUSTOMER_PORTAL` / `isCustomerPortalEnabled()`.

### Acceptance

- [x] Confirmed-booking notification includes portal deep link when feature flag `customer_portal` on (default on in dev).
- [x] Guest manage page still fully functional without account.

### Tests

- Notification/email render test contains `/portal/` (`BookingEmailNotificationTest`); manage → register prefill via query params (Playwright portal suite / manual until T-037 expands).
