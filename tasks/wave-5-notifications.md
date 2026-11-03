# Wave 5 — Notifications and timers (T-025, T-026)

**Design:** `docs/design/mvp/07-notifications.md`  
**Packages:** `packages/emails` (Nest-era); Laravel should use Notifications / Mailables.

### Laravel port (`shedflow-back`)

| Nest task | Laravel reality |
| --- | --- |
| T-025 Email templates + Resend + ICS | **DONE on Laravel** — `notification_logs`, idempotent `BookingNotificationService` + ICS (`BookingIcs`); host email via `organization.settings.notifications.hostEmail` |
| T-026 Reminders, hold expiry, purge | **DONE on Laravel** — `ReminderPlanner`, delayed `SendBookingReminderJob`, receipt hold expiry via `bookings:expire-payment-holds`; idempotency/calendar daily purges deferred until T-008 / Wave 3 |

---

## T-025 — Email templates and Resend

**Status:** DONE (Nest + Laravel booking emails); auth verify/reset/invitation email still Nest-only  
**Depends on:** T-009, T-015, T-005  
**Apps:** was `apps/worker`, `packages/emails` → `shedflow-back` notifications

### Implementation

- `packages/emails`: React Email templates listed in `07` §2. Preview script `pnpm --filter @shedflow/emails dev`.
- `Mailer` port + `ResendMailer`. Dev without `RESEND_API_KEY`: log HTML to worker logs, still insert `notification_logs` SENT.
- Prisma `NotificationLog`. Unique `(bookingId, template, channel)` where bookingId present (partial unique SQL if Prisma cannot).
- Handlers for: verify-email, reset-password, invitation, booking confirmed/cancelled/rescheduled (host+invitee), pending confirmation.
- Attach `.ics` for confirm/reschedule/cancel.
- `EMAIL_FROM` env.
- Idempotent Resend header.

### Acceptance

- [x] Confirming a free booking produces two notification_logs (host, invitee) and no throw if Resend unset. *(Laravel: auto-confirm public book + `MAIL_MAILER=log|array`)*
- [x] Duplicate outbox replay does not insert a second SENT row for same template. *(Laravel: `IdempotentBookingMailer` + partial unique index)*
- [x] `.ics` UID uses `booking.uid@schedflow.com`. *(Laravel: `App\Support\BookingIcs`)*
- [x] Invitation email used from T-006 accept flow (enqueue `invitation.created` in T-006 if missing — add emit now). *(Nest)*

---

## T-026 — Reminders, hold expiry, purge jobs

**Status:** DONE (Nest + Laravel); Stripe checkout hold expiry **OBSOLETE**  
**Depends on:** T-025, T-015  
**Design:** `07` §3, §6

### Implementation

- Schedule reminder send 24h and 1h via Laravel scheduler/queues.
- Daily purge jobs as needed (idempotency if T-008 ported; calendar renew if Wave 3 ported).
- Skip reminders if startAt too close (`07` §3).
- Optional: email invitee when staff confirms a **receipt** booking (Wave 4 T-021) — not Stripe payment-failed/receipt-from-gateway emails.

### Acceptance (Nest historical checked; re-prove on Laravel when ported)

- [x] Freeze clock: booking in 2h → only 1h reminder scheduled (or 24h skipped). *(Nest + Laravel `ReminderPlanner`)*
- [x] Laravel: reminders for confirmed bookings (`BookingReminderService` + queue jobs on confirm/reschedule).
- [x] Cancelled booking: reminder job no-ops. *(Nest + Laravel `sendIfDue`)*
- [x] Receipt-upload hold expiry scheduled (`bookings:expire-payment-holds` every minute).
- ~~Stripe Checkout `PENDING_PAYMENT` hold expiry~~ — obsolete. Optional **receipt-upload** hold expiry (Wave 4 T-020) is separate — implement as a Laravel scheduled job only if product enables `hold_expires_at`.
