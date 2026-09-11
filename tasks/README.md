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
| Local Postgres + Prometheus/Grafana compose | Done (ports: Postgres **5434**, Grafana **3000** — Grafana will move in T-035) |

## How to execute a task

1. Status in the task file is `TODO` | `IN PROGRESS` | `DONE`.
2. Implement only that task’s scope. If you must touch another area, keep it the minimum compile fix and note it.
3. Follow existing patterns: domain entity + abstract `Repository` + `PrismaRepository` + Nest module (`IMPLEMENTATION-NOTES.md` / `apps/api` README persistence section).
4. Client UI: **shadcn via `@shedflow/ui` only** (`docs/design/mvp/08-frontend.md`). Add missing primitives to `packages/ui` in the same PR as first use.
5. UTC in DB, money as integer minor units, tenant queries always include `organizationId`.
6. Tests listed in the task are mandatory. Run `pnpm --filter @shedflow/api test` (and e2e if the task says so).
7. Mark the task `DONE` at the top of its file when acceptance criteria pass.

## Waves and dependency graph

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

## Definition of done for the MVP

All of **T-001–T-016** and **T-018–T-039** are DONE. **T-017** (Outlook) is optional and must not block launch. A stranger can:

1. Register, land in dashboard, complete onboarding.
2. Publish a free event type and book it from the hosted page.
3. Connect Stripe (test mode), take a paid booking, see it CONFIRMED after webhook.
4. Cancel/reschedule from the email manage link.
5. (Pro) Create an API key and receive `booking.confirmed`.

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
