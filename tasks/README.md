# SchedFlow MVP tasks

These tasks take the repo from **auth shell (done)** to a **launchable Phase 1**.  
Design source of truth: [`docs/design/README.md`](../docs/design/README.md).

Agents: read **this file**, then the **single task** you are implementing, then the linked design sections. Do not skip acceptance criteria. Do not implement Phase 2 (`docs/design/full-scale/**`) unless a task says so.

## Current baseline (do not redo)

| Area | Status |
| --- | --- |
| NestJS `apps/api` JWT auth (`/auth/register`, `/auth/login`, `/auth/me`) | Done |
| Prisma 7 + Postgres `users` + repository ports | Done |
| Next.js `apps/client` NextAuth credentials + login/register/dashboard stub | Done |
| `@shedflow/ui` shadcn (Alert, Accordion) + Tailwind 4 | Done |
| Local Postgres + Prometheus/Grafana compose | Done (ports: Postgres **5434**, Grafana **3300** after T-035; Next **3000**) |
| MVP Waves 0–8 (T-001 … T-039) | Done (see wave files) |

## How to execute a task

1. Status in the task file is `TODO` | `IN PROGRESS` | `DONE`.
2. Implement only that task’s scope. If you must touch another area, keep it the minimum compile fix and note it.
3. Follow existing patterns: domain entity + abstract `Repository` + `PrismaRepository` + Nest module (`IMPLEMENTATION-NOTES.md` / `apps/api` README persistence section).
4. Client UI: **shadcn via `@shedflow/ui` only** (`docs/design/mvp/08-frontend.md`). Add missing primitives to `packages/ui` in the same PR as first use.
5. UTC in DB, money as integer minor units, tenant queries always include `organizationId`.
6. Tests listed in the task are mandatory. Run `pnpm --filter @shedflow/api test` (and e2e if the task says so).
7. Mark the task `DONE` at the top of its file when acceptance criteria pass.

## Waves and dependency graph

### Phase 1 — MVP (T-001 … T-039) — complete

```
T-001 → T-002 → T-003 → T-004 → T-005
                      ↘ T-008
T-003 → T-006 → T-007 → T-009
T-006 → T-010 → T-011 → T-012 → T-013 → T-014 → T-015
T-009 + T-014 → T-016
T-003 → T-018 → T-019 → T-020 → T-021 → T-022 → T-023 → T-024
T-009 + T-014 → T-025 → T-026
T-011 → T-027 → T-028
T-006 → T-029 → T-030 → T-031 → T-032
T-014 + T-024 → T-033
T-003 → T-034 T-035 T-036 T-037 T-038 T-039
T-016 → T-017 (optional)
```

Parallelism: after T-003, tenancy (T-006), billing skeleton (T-018), and UI primitive install (T-027a inside T-029) can proceed in parallel. **Do not start bookings (T-014) without T-012 and the exclusion-constraint migration.**

| Wave | Tasks | Goal |
| --- | --- | --- |
| 0 Foundations | T-001 … T-005 | Shared DB package, API baseline, refresh tokens, password email tokens |
| 1 Tenancy & async | T-006 … T-009 | Orgs, RBAC, JWT org claim, outbox, worker |
| 2 Scheduling | T-010 … T-015 | Schedules, event types, slots, customers, bookings, cancel/reschedule |
| 3 Calendar | T-016, T-017 | Google (required), Outlook (optional) |
| 4 Billing | T-018 … T-024 | Stripe Connect, catalog, paid bookings, credits, platform Pro |
| 5 Notifications | T-025, T-026 | Emails, reminders, expiry |
| 6 Client | T-027 … T-032 | Booking page, embed, dashboard (shadcn) |
| 7 Developer | T-033 | API keys, webhooks |
| 8 Launch hardening | T-034 … T-039 | GDPR, observability, CI, E2E, flags, a11y |

### Phase 1.5 — Customer portal (end users) (T-040 … T-082)

MVP explicitly deferred **customer accounts / login portal** (`docs/design/00-product-scope.md` §4). Waves 9–16 add a **mobile-first** end-customer experience so invitees can manage profile, appointments, payments, and related data — without rebuilding staff dashboard work from Waves 6–8.

```
T-013 + T-007 → T-040 → T-041 → T-042 → T-043 → T-044
T-041 + T-029 → T-045 → T-046 → T-047 → T-048
T-043 + T-046 → T-049 → T-050 → T-051 → T-052 → T-053 → T-054
T-042 + T-046 → T-055 → T-056 → T-057 → T-058 → T-059 → T-060
T-042 + T-021 → T-061 → T-062 → T-063 → T-064 → T-065
T-042 → T-066 → T-067 → T-068 → T-069 → T-070 → T-071 → T-072
T-043 → T-073 → T-074 → T-075 → T-076
T-059 + T-034 → T-077 → T-078 → T-079 → T-080 → T-081 → T-082
```

Parallelism: after T-043 + T-046, profile (Wave 12), appointments (Wave 11), and payments (Wave 13) can proceed in parallel. Engagement (Wave 14) needs profile prefs (T-057) for notification gates. Compliance/PWA (Wave 16) waits on privacy UI (T-059) and core portal routes.

| Wave | Tasks | Goal |
| --- | --- | --- |
| 9 Customer identity | T-040 … T-044 | Customer↔User link, claim/login, portal APIs, seed customer |
| 10 Customer shell | T-045 … T-048 | `/portal` mobile shell, tokens, deep links (reserve vs `[orgSlug]`) |
| 11 Appointments | T-049 … T-054 | Home, list/detail, in-portal book, policies, series, notes |
| 12 Profile & settings | T-055 … T-060 | Identity, prefs, notification channels, 2FA/sessions, privacy |
| 13 Payments & plans | T-061 … T-065 | Receipts, cards via Stripe Portal, memberships, packages, gift cards |
| 14 Engagement | T-066 … T-072 | Favorites, family, waitlist, messaging, reviews, referrals, inbox |
| 15 Docs & calendar | T-073 … T-076 | Forms/waivers, customer calendar/ICS, SMS/push prefs, documents vault |
| 16 Compliance & CRM | T-077 … T-082 | GDPR portal DSR, PWA, staff CRM complements, multi-biz, E2E |

## Definition of done for the MVP

All of **T-001–T-016** and **T-018–T-039** are DONE. **T-017** (Outlook) is optional and must not block launch. A stranger can:

1. Register, land in dashboard, complete onboarding.
2. Publish a free event type and book it from the hosted page.
3. Connect Stripe (test mode), take a paid booking, see it CONFIRMED after webhook.
4. Cancel/reschedule from the email manage link.
5. (Pro) Create an API key and receive `booking.confirmed`.

## Definition of done for the customer portal (Waves 9–16)

Required set: **T-040–T-064**, **T-066–T-070**, **T-072–T-074**, **T-076–T-082**. Optional / flag-gated: **T-053** (recurring), **T-065** (gift cards), **T-071** (referrals), **T-075** SMS/push beyond email. A stranger can:

1. Book as a guest, claim an account, and see appointments on mobile `/portal`.
2. Reschedule/cancel from the portal (and still from signed email links).
3. Manage profile, notification prefs, 2FA/sessions, and privacy/export/delete.
4. View payments/memberships/credits and open Stripe Customer Portal for cards.
5. Complete required waivers; add dependents; join a waitlist alert; message the business.
6. Staff see complementary CRM fields for portal-originated data.

## File map

| File | Contents |
| --- | --- |
| [wave-0-foundations.md](./wave-0-foundations.md) | T-001 … T-005 |
| [wave-1-tenancy-async.md](./wave-1-tenancy-async.md) | T-006 … T-009 |
| [wave-2-scheduling.md](./wave-2-scheduling.md) | T-010 … T-015 |
| [wave-3-calendar.md](./wave-3-calendar.md) | T-016, T-017 |
| [wave-4-billing.md](./wave-4-billing.md) | T-018 … T-024 |
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

From `packages/db/prisma/seed.ts` / `apps/client/README.md` (T-036):

| Persona | Email | Password | Entry |
| --- | --- | --- | --- |
| Business owner | `owner@shedflow.dev` | `Password123!` | `/login` → `/dashboard` (org `acme`) |
| End customer | *(added by T-044)* `customer@shedflow.dev` | `Password123!` | `/portal/login` |

Until T-044 lands, customers use public `/acme` / `/acme/intro` and signed `/b/{uid}/manage?token=…` links only.
