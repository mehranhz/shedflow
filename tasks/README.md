# SchedFlow MVP tasks

These tasks take the repo from **auth shell** to a **launchable Phase 1**, then a **customer portal**.  
Design source of truth: [`docs/design/README.md`](../docs/design/README.md).

**Backend of record:** Laravel API in [`shedflow-back`](../../shedflow-back) (sibling repo/folder). NestJS `apps/api`, `apps/billing`, and `apps/worker` are **legacy / obsolete** as the runtime backend — treat Nest-only acceptance criteria as historical unless a task explicitly reimplements the capability in Laravel.

Agents: read **this file**, then the **single task** you are implementing, then the linked design sections. Do not skip acceptance criteria. Do not implement Phase 2 (`docs/design/full-scale/**`) unless a task says so. **Do not implement a Stripe/payment gateway** unless a future task re-opens it — current money flow is **payment-receipt upload + staff confirmation** (Waves 4 & 13).

## Current baseline (do not redo)

| Area | Status |
| --- | --- |
| Laravel `shedflow-back` JWT auth (`/auth` + `/v1/auth`: register, login, refresh, logout, OTP, me) | Done |
| Laravel orgs, memberships, invitations, org switch | Done |
| Laravel schedules, availability rules/overrides, event types, customers, slots, bookings (public + host), cancel/reschedule/confirm/no-show, signed action tokens | Done |
| Laravel `requires_confirmation` on event types → `PENDING_CONFIRMATION` | Done |
| NestJS `apps/api` / Prisma monorepo backend | Obsolete (superseded by Laravel) |
| NestJS `apps/billing` Stripe Connect / Checkout | Obsolete / deferred (replaced by receipt confirmation tasks) |
| Next.js `apps/client` staff dashboard + public booking + portal stubs | Partially done (see Waves 6, 9–16) |
| `@shedflow/ui` shadcn + Tailwind 4 | Done |
| Local Postgres + Prometheus/Grafana compose (Nest-era) | Historical; Laravel uses its own `.env` DB |
| MVP Waves 0–8 Nest implementation | Historical DONE in Nest; **re-verify gaps in Laravel** (calendar, emails/worker, API keys, Stripe → cancelled, observability) |

## Remaining work (snapshot)

| Priority | Work | Where |
| --- | --- | --- |
| P0 | Wave 4 receipt confirmation + Wave 5 emails/reminders DONE on Laravel | `shedflow-back` + `apps/client` |
| P1 | **T-040–T-048 DONE** (customer APIs + portal shell, brand/i18n/analytics, email deep links); next **Wave 11** appointments UX (T-049+) | `shedflow-back` + `apps/client` |
| P1 | Waves 11–12, 14–16 customer portal; Wave 13 = receipt list only (T-061); T-062–T-065 cancelled | `shedflow-back` + `apps/client` |
| P2 | Laravel ports still missing vs old Nest MVP: Google/Outlook calendar, idempotency/outbox daily purge (if T-008 ported), developer API keys/webhooks, GDPR export, platform Pro via Stripe (**deferred**) | `shedflow-back` |
| Cancelled | Full Stripe Connect, Checkout, credits, packages, gift cards, customer card portal | — |

## How to execute a task

1. Status in the task file is `TODO` | `IN PROGRESS` | `DONE` | `CANCELLED` (deferred).
2. Implement only that task’s scope. If you must touch another area, keep it the minimum compile fix and note it.
3. **Backend:** Laravel patterns in `shedflow-back` (controllers, FormRequests, Services, Policies, migrations, feature tests). Do not add features to Nest `apps/api` / `apps/billing` unless a task says so.
4. Client UI: **shadcn via `@shedflow/ui` only** (`docs/design/mvp/08-frontend.md`). Add missing primitives to `packages/ui` in the same PR as first use.
5. UTC in DB, tenant queries always include `organizationId` / `organization_id`. Money ledgers are **out of scope** while receipt confirmation is the payment UX.
6. Tests listed in the task are mandatory. Prefer `php artisan test` in `shedflow-back` and client Playwright where specified.
7. Mark the task `DONE` at the top of its file when acceptance criteria pass.

## Waves and dependency graph

### Phase 1 — MVP (T-001 … T-039)

Nest-era Waves 0–8 were implemented against `apps/api` / `apps/billing` / `apps/worker`. **Laravel already covers core tenancy + scheduling.** Active Phase-1 backend follow-ups are **Wave 4 receipt confirmation** and optional re-ports of calendar/notifications/developer/launch items into `shedflow-back`.

```
T-001 → T-002 → T-003 → T-004 → T-005   (Nest historical / Laravel auth done)
T-003 → T-006 → T-007 → T-009           (tenancy done in Laravel; Nest worker obsolete)
T-006 → T-010 → T-011 → T-012 → T-013 → T-014 → T-015  (scheduling done in Laravel)
T-009 + T-014 → T-016                   (calendar: still TODO in Laravel if needed)
T-018 → T-019 → T-020 → T-021 → T-022 → T-023   (receipt confirmation — active)
T-024 Stripe platform                     (CANCELLED / deferred)
T-009 + T-014 → T-025 → T-026           (notifications: re-port to Laravel as needed)
T-011 → T-027 → T-028                   (client booking/embed — adjust for receipts)
T-006 → T-029 → T-030 → T-031 → T-032   (dashboard — drop Stripe billing CTAs)
T-014 + T-024 → T-033                   (developer keys: optional Laravel later; T-024 cancelled)
T-003 → T-034 … T-039                   (launch hardening — re-target Laravel/ops)
```

| Wave | Tasks | Goal |
| --- | --- | --- |
| 0 Foundations | T-001 … T-005 | Historical Nest shared DB/auth baseline → Laravel auth done |
| 1 Tenancy & async | T-006 … T-009 | Orgs/RBAC done in Laravel; Nest outbox/worker obsolete |
| 2 Scheduling | T-010 … T-015 | Schedules, event types, slots, customers, bookings — **Laravel done** |
| 3 Calendar | T-016, T-017 | Google/Outlook — **not in Laravel yet** (optional) |
| 4 Receipt confirmation | T-018 … T-023; T-024 cancelled | Admin receipt step, upload, staff approve; **no Stripe** |
| 5 Notifications | T-025, T-026 | Emails/reminders — re-port to Laravel queues/SMS as needed |
| 6 Client | T-027 … T-032 | Booking page, embed, dashboard (strip Stripe; add receipt UX) |
| 7 Developer | T-033 | API keys/webhooks — optional Laravel later |
| 8 Launch hardening | T-034 … T-039 | GDPR, observability, CI, E2E, flags, a11y |

### Phase 1.5 — Customer portal (end users) (T-040 … T-082)

MVP explicitly deferred **customer accounts / login portal** (`docs/design/00-product-scope.md` §4). Waves 9–16 add a **mobile-first** end-customer experience. Implement portal APIs in **`shedflow-back`**, not Nest.

```
T-013 + T-007 → T-040 → T-041 → T-042 → T-043 → T-044
T-041 + T-029 → T-045 → T-046 → T-047 → T-048
T-043 + T-046 → T-049 → T-050 → T-051 → T-052 → T-053 → T-054
T-042 + T-046 → T-055 → T-056 → T-057 → T-058 → T-059 → T-060
T-042 + T-020 → T-061          (receipt list; T-062…T-065 CANCELLED)
T-042 → T-066 → T-067 → T-068 → T-069 → T-070 → T-071 → T-072
T-043 → T-073 → T-074 → T-075 → T-076
T-059 + T-034 → T-077 → T-078 → T-079 → T-080 → T-081 → T-082
```

Parallelism: after T-043 + T-046, profile (Wave 12), appointments (Wave 11), and **receipt list (T-061)** can proceed in parallel. Engagement (Wave 14) needs profile prefs (T-057). Compliance/PWA (Wave 16) waits on privacy UI (T-059) and core portal routes.

| Wave | Tasks | Goal |
| --- | --- | --- |
| 9 Customer identity | T-040 … T-044 | Customer↔User link, claim/login, portal APIs, seed customer |
| 10 Customer shell | T-045 … T-048 | `/portal` mobile shell, tokens, deep links |
| 11 Appointments | T-049 … T-054 | Home, list/detail, in-portal book, policies, series, notes |
| 12 Profile & settings | T-055 … T-060 | Identity, prefs, notification channels, 2FA/sessions, privacy |
| 13 Payment receipts | T-061; T-062…T-065 cancelled | Customer receipt status list (no Stripe portal/memberships) |
| 14 Engagement | T-066 … T-072 | Favorites, family, waitlist, messaging, reviews, referrals, inbox |
| 15 Docs & calendar | T-073 … T-076 | Forms/waivers, customer calendar/ICS, SMS/push prefs, documents vault |
| 16 Compliance & CRM | T-077 … T-082 | GDPR portal DSR, PWA, staff CRM complements, multi-biz, E2E |

## Definition of done for the MVP

Core scheduling path works against **Laravel** `shedflow-back`. **T-017** (Outlook) remains optional. A stranger can:

1. Register, land in dashboard, complete onboarding.
2. Publish a free event type and book it from the hosted page.
3. (When Wave 4 done) Enable **require payment receipt** on an event type; invitee uploads a receipt; staff approve → booking CONFIRMED. **No Stripe Checkout.**
4. Cancel/reschedule from the email/SMS manage link.
5. (Optional later) API keys / `booking.confirmed` webhooks in Laravel.

## Definition of done for the customer portal (Waves 9–16)

Required set: **T-040–T-061**, **T-066–T-070**, **T-072–T-074**, **T-076–T-082**. Optional / flag-gated: **T-053** (recurring), **T-071** (referrals), **T-075** SMS/push beyond email. **T-062–T-065** cancelled (Stripe portal/memberships/packages/gift cards). A stranger can:

1. Book as a guest/verified user, claim an account, and see appointments on mobile `/portal`.
2. Reschedule/cancel from the portal (and still from signed manage links).
3. Manage profile, notification prefs, 2FA/sessions, and privacy/export/delete.
4. View **payment-receipt status** for bookings that required upload (not card vault).
5. Complete required waivers; add dependents; join a waitlist alert; message the business.
6. Staff see complementary CRM fields for portal-originated data.

## File map

| File | Contents |
| --- | --- |
| [wave-0-foundations.md](./wave-0-foundations.md) | T-001 … T-005 |
| [wave-1-tenancy-async.md](./wave-1-tenancy-async.md) | T-006 … T-009 |
| [wave-2-scheduling.md](./wave-2-scheduling.md) | T-010 … T-015 |
| [wave-3-calendar.md](./wave-3-calendar.md) | T-016, T-017 |
| [wave-4-billing.md](./wave-4-billing.md) | T-018 … T-024 (receipt confirmation; Stripe deferred) |
| [wave-5-notifications.md](./wave-5-notifications.md) | T-025, T-026 |
| [wave-6-frontend.md](./wave-6-frontend.md) | T-027 … T-032 |
| [wave-7-developer.md](./wave-7-developer.md) | T-033 |
| [wave-8-launch.md](./wave-8-launch.md) | T-034 … T-039 |
| [wave-9-customer-identity.md](./wave-9-customer-identity.md) | T-040 … T-044 |
| [wave-10-customer-shell.md](./wave-10-customer-shell.md) | T-045 … T-048 |
| [wave-11-customer-appointments.md](./wave-11-customer-appointments.md) | T-049 … T-054 |
| [wave-12-customer-profile.md](./wave-12-customer-profile.md) | T-055 … T-060 |
| [wave-13-customer-payments.md](./wave-13-customer-payments.md) | T-061 … T-065 |
| [wave-14-customer-engagement.md](./wave-14-customer-engagement.md) | T-066 … T-072 |
| [wave-15-customer-documents-calendar.md](./wave-15-customer-documents-calendar.md) | T-073 … T-076 |
| [wave-16-compliance-crm-pwa.md](./wave-16-compliance-crm-pwa.md) | T-077 … T-082 |

## Demo credentials (seed)

Laravel seeders live under `shedflow-back/database/seeders`. Nest-era seed (`packages/db/prisma/seed.ts`) is historical.

| Persona | Email / phone | Password | Entry |
| --- | --- | --- | --- |
| Business owner | see Laravel / client README seed | — | `/login` → `/dashboard` |
| End customer | `customer@shedflow.dev` | `Password123!` | `/portal/login` |

Until T-044 lands, customers use public `/[orgSlug]` booking and signed `/b/{uid}/manage?token=…` links (Laravel public booking currently expects a verified phone).
