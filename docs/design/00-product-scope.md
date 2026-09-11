# 00 — Product scope, personas, glossary

## 1. What SchedFlow is

A small business ("**Organization**", the tenant) signs up, connects its
calendar, defines **Event Types** (e.g. "60-min coaching session", "Initial
consultation"), sets **Availability**, and optionally attaches a **Price**
(pay-per-booking) or requires an active **Subscription** (membership: "4
sessions/month"). The business's clients ("**Customers**", a.k.a. invitees)
book through a **hosted booking page** (`schedflow.com/{org}/{event}`) or an
**embedded widget** on the business's own site, pay via Stripe, and receive
confirmations, calendar invites and reminders. The business manages everything
from a **dashboard**, and can integrate through a **developer API + webhooks**.

SchedFlow monetises by charging the business a **platform subscription** (Free /
Pro) plus an **application fee** on payments processed through Stripe Connect.

## 2. Personas

| Persona | Role in system | Primary goals |
| --- | --- | --- |
| **Owner** (business owner, solo practitioner) | `OWNER` member of an Organization | Set up in <10 min, get bookings, get paid, stop no-shows |
| **Staff** (employee/host) | `MEMBER` member | Manage own availability and bookings |
| **Admin** (office manager) | `ADMIN` member | Manage team, customers, refunds, billing settings |
| **Customer / Invitee** | External, no account (MVP) | Book, pay, reschedule, cancel from email links |
| **Developer** | Uses API keys | Sync bookings into CRM, trigger automations |
| **SchedFlow operator** | Platform admin | Support customers, monitor health, manage abuse |

## 3. Core user journeys (MVP must support end-to-end)

1. **Onboarding**: register → create organization (name, slug, timezone) →
   connect Google Calendar (optional) → create first event type → copy link.
2. **Free booking**: invitee opens hosted page → picks timezone/date/slot →
   enters name/email/answers → booking confirmed → both parties get email with
   `.ics`, calendar event created on host's Google Calendar → reminders sent.
3. **Paid booking**: same, but slot is held for 15 minutes while invitee pays via
   Stripe Checkout → confirmation on payment success → expiry releases the slot.
4. **Membership booking**: customer purchases a recurring plan (Stripe Checkout
   subscription on the connected account) → gets N credits per period → books
   credit-consuming event types without paying per booking → credits refill each
   period; cancellation stops refill.
5. **Reschedule / cancel**: invitee or host uses signed links or dashboard →
   notifications and calendar updated → refund/credit rules applied.
6. **Payouts & billing management**: owner connects Stripe (Express onboarding),
   sees payments, issues refunds, sees subscriptions/invoices.
7. **Platform upgrade**: owner upgrades SchedFlow plan Free → Pro via Stripe
   Checkout; Pro unlocks paid bookings, subscriptions, custom branding, API.
8. **Integrate**: developer creates API key, registers webhook endpoint,
   receives `booking.created`.

## 4. MVP scope cut

### In scope (Phase 1)

- Email/password auth (done), refresh tokens, password reset, email verification
- Organizations, memberships, roles (OWNER/ADMIN/MEMBER), invitations
- Schedules with weekly rules + date overrides, per-host
- Event types (1:1), buffers, min notice, max days ahead, daily cap, custom
  questions, location types (Google Meet, link, phone, in-person, custom)
- Availability computation, slot generation, DST-safe, invitee timezone
- Booking create / cancel / reschedule with DB-enforced double-booking
  prevention; manual confirmation mode
- Google Calendar: OAuth, conflict check against selected calendars, write
  bookings, Google Meet links
- Microsoft 365 / Outlook calendar (same feature set; **launch-optional**)
- Stripe Connect Express onboarding; pay-per-booking via Checkout; refunds
- Products/prices catalog mirrored to Stripe; recurring plans; credits
  entitlement; subscription lifecycle via Stripe webhooks; invoices mirrored;
  dunning emails on failed invoice; Stripe Tax toggle
- Email notifications (confirmation, reminders 24h/1h, cancellation,
  reschedule, payment receipt, failed payment) with `.ics`
- Hosted booking page (SSR, themable), embed widget (inline/popup)
- Dashboard (shadcn): onboarding, event types, availability, bookings,
  customers, billing, team, settings, developer
- Developer REST API v1 with API keys; webhooks with HMAC signature & retries
- Platform billing: Free / Pro plans on Stripe Billing; feature gating
- Security baseline: rate limiting, CORS, Helmet, encrypted tokens, audit log,
  GDPR export/erasure for customers and users
- Observability: structured logs, request ids, Prometheus metrics, OTel traces,
  Sentry, basic dashboards and alert rules, runbooks
- CI (lint/test/e2e/build), containerised deploys, migrations, backups

### Explicitly out of scope for Phase 1 (designed in Phase 2)

- Group events (capacity > 1), collective/round-robin team events, waitlists
- SMS and push notifications (design included; ship after launch)
- Customer accounts / customer login portal (invitees act via signed links)
- Multiple currencies per organization; multi-entity tax
- Custom domains for booking pages
- Template editor for notifications (MVP templates are code)
- Zoom/Teams video providers (Google Meet only)
- Routing forms, workflows/automations builder
- Mobile apps
- Multi-region, CQRS, per-service databases

## 5. Non-functional targets

| Metric | MVP | Full-scale |
| --- | --- | --- |
| Availability (booking flow) | 99.5% monthly | 99.99% |
| p95 latency — slot query | < 600 ms | < 200 ms |
| p95 latency — booking create | < 1 s | < 300 ms |
| RPO / RTO | 5 min / 4 h | ~0 / < 5 min (region failover) |
| Tenants | 1k orgs | 1M orgs |
| Bookings | 100k / month | 1B / year |
| Compliance | PCI SAQ A, GDPR basics | PCI SAQ A (Level 1 merchant obligations via PSP), SOC 2 Type II, GDPR, ISO 27001 |

## 6. Glossary

| Term | Meaning |
| --- | --- |
| Organization | The tenant; a business using SchedFlow |
| Member | A user with a role in an organization |
| Host | The member whose availability a booking consumes |
| Event Type | A bookable template (duration, location, price, questions) |
| Schedule | A named availability set (weekly rules + date overrides) in a timezone |
| Slot | A concrete `[start, end)` UTC interval that can be booked |
| Booking | A reserved slot with invitee details and a status |
| Busy block | An interval that blocks availability (booking incl. buffers, or external calendar event) |
| Customer | A person who books with an organization; identified by email per org |
| Product / Price | Catalog items mirrored to Stripe (one-time or recurring) |
| Subscription | A customer's recurring plan with an organization |
| Credit | Entitlement unit granted by a subscription period and consumed by bookings |
| Platform plan | SchedFlow's own Free/Pro plan charged to the organization |
| Connected account | The organization's Stripe Express account (receives funds) |
| Domain event | Immutable fact written to the outbox (`booking.created`, …) |
| Signed action link | URL containing an HMAC token that authorises cancel/reschedule without login |
