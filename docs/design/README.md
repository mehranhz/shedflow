# SchedFlow — System Design

SchedFlow is a SaaS that combines Calendly-style scheduling with built-in
subscription and payment collection for small businesses (coaches, clinics,
consultants, tutors, salons, trainers). A business publishes bookable event
types, sells one-off paid sessions or recurring memberships, and lets its
customers book, pay, reschedule and cancel from a hosted page or an embedded
widget.

This folder is the single source of truth for architecture. It is written to be
consumed by both engineers and coding agents. Every implementation task in
`[/tasks](../../tasks/README.md)` and `[AGENTS.md](../../AGENTS.md)`
reference sections here by path. Agents implement **MVP tasks only** unless
asked for Phase 2.

## How the documentation is organised


| Path                  | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `00-product-scope.md` | Personas, use cases, MVP scope cut, non-goals, glossary                                       |
| `mvp/`                | **Phase 1** — complete design of the MVP (microservices, minimal, solo dev, 2 weeks)          |
| `full-scale/`         | **Phase 2** — complete design of the world-class platform and the migration path from Phase 1 |


Both phases cover the same domains, in the same order, so a reader can diff the
two designs section by section:


| #   | Domain                                         | MVP                                        | Full-scale                                                                   |
| --- | ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| 01  | Architecture, service decomposition, stack     | `mvp/01-architecture.md`                   | `full-scale/01-architecture.md`                                              |
| 02  | Data model, schema, indexes, migrations        | `mvp/02-data-model.md`                     | `full-scale/02-data-cqrs.md`                                                 |
| 03  | API design, auth, tenancy, idempotency, errors | `mvp/03-api-and-auth.md`                   | `full-scale/01-architecture.md` §API, `full-scale/06-security-compliance.md` |
| 04  | Scheduling engine                              | `mvp/04-scheduling-engine.md`              | `full-scale/03-scheduling-at-scale.md`                                       |
| 05  | Billing, subscriptions, payments, PCI          | `mvp/05-billing-and-payments.md`           | `full-scale/04-billing-payments-pci.md`                                      |
| 06  | Calendar integration                           | `mvp/06-calendar-integration.md`           | `full-scale/05-integrations-notifications-webhooks.md`                       |
| 07  | Notifications                                  | `mvp/07-notifications.md`                  | `full-scale/05-integrations-notifications-webhooks.md`                       |
| 08  | Frontend: dashboard, booking page, embed       | `mvp/08-frontend.md`                       | `full-scale/01-architecture.md` §Edge & frontend                             |
| 09  | Developer API and webhooks                     | `mvp/09-developer-api-and-webhooks.md`     | `full-scale/05-integrations-notifications-webhooks.md`                       |
| 10  | Security, privacy, GDPR, audit                 | `mvp/10-security-and-privacy.md`           | `full-scale/06-security-compliance.md`                                       |
| 11  | Observability, SLOs, runbooks, ops tooling     | `mvp/11-observability-and-operations.md`   | `full-scale/07-observability-sre.md`                                         |
| 12  | Infrastructure, CI/CD, environments, DR        | `mvp/12-infrastructure-cicd-dr.md`         | `full-scale/08-infrastructure-multiregion-dr.md`                             |
| 13  | Testing                                        | `mvp/13-testing-strategy.md`               | `full-scale/09-testing-chaos.md`                                             |
| 14  | Platform billing & customer lifecycle          | `mvp/14-platform-billing-and-lifecycle.md` | `full-scale/10-platform-billing-ops-tooling.md`                              |
| 15  | i18n, l10n, accessibility, compliance          | `mvp/15-i18n-a11y-compliance.md`           | `full-scale/06-security-compliance.md` §Compliance                           |
| —   | Migration roadmap MVP → full-scale             | —                                          | `full-scale/11-migration-roadmap.md`                                         |




## Ground rules that apply to both phases

1. **UTC everywhere in storage.** Time zones are a presentation and rule concern
  (availability rules are defined in the schedule's IANA zone). All timestamps
   are `timestamptz` and all API payloads use RFC 3339 with explicit offsets.
2. **Money is integer minor units + ISO 4217 currency.** Never floats.
3. **Card data never touches SchedFlow.** Stripe Checkout / Elements / Connect
  keep us in PCI SAQ A scope in Phase 1 and Phase 2.
4. **Every state change emits a domain event** (outbox pattern). Notifications,
  webhooks, analytics and calendar writes are consumers, never inline side
   effects.
5. **Tenant isolation is enforced in the persistence layer**, not in
  controllers. A query without an `organizationId` scope on a tenant-owned
   table is a bug.
6. **Idempotency on every mutating public endpoint** via `Idempotency-Key`.
7. **Ports and adapters.** Services depend on abstract classes (repositories,
  `PaymentGateway`, `CalendarProvider`, `Mailer`, `JobQueue`). Vendors are
   swappable behind them. This is already the convention in `apps/api`
   (`src/common/persistence`).

