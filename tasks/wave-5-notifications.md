# Wave 5 — Notifications and timers (T-025, T-026)

**Design:** `docs/design/mvp/07-notifications.md`  
**Packages:** `packages/emails` (new)

---

## T-025 — Email templates and Resend

**Status:** TODO  
**Depends on:** T-009, T-015, T-005  
**Apps:** `apps/worker`, `packages/emails`

### Implementation

- `packages/emails`: React Email templates listed in `07` §2. Preview script `pnpm --filter @shedflow/emails dev`.
- `Mailer` port + `ResendMailer`. Dev without `RESEND_API_KEY`: log HTML to worker logs, still insert `notification_logs` SENT.
- Prisma `NotificationLog`. Unique `(bookingId, template, channel)` where bookingId present (partial unique SQL if Prisma cannot).
- Handlers for: verify-email, reset-password, invitation, booking confirmed/cancelled/rescheduled (host+invitee), pending confirmation.
- Attach `.ics` for confirm/reschedule/cancel.
- `EMAIL_FROM` env.
- Idempotent Resend header.

### Acceptance

- [ ] Confirming a free booking produces two notification_logs (host, invitee) and no throw if Resend unset.
- [ ] Duplicate outbox replay does not insert a second SENT row for same template.
- [ ] `.ics` UID uses `booking.uid@schedflow.com`.
- [ ] Invitation email used from T-006 accept flow (enqueue `invitation.created` in T-006 if missing — add emit now).

---

## T-026 — Reminders, hold expiry, purge jobs

**Status:** TODO  
**Depends on:** T-025, T-015, T-021  
**Design:** `07` §3, §6; `05` revive already in T-021

### Implementation

- Schedule `reminder.send` 24h and 1h (`singletonKey`).
- `booking.expire` at `holdExpiresAt` → internal expire.
- Daily: `idempotency.purge`, `calendar.renew_watch` (if T-016), audit retention optional later.
- Skip reminders if startAt too close (`07` §3).
- Payment failed / receipt emails from billing outbox events.

### Acceptance

- [ ] Freeze clock: booking in 2h → only 1h reminder scheduled (or 24h skipped).
- [ ] PENDING_PAYMENT becomes EXPIRED after hold; slot bookable again.
- [ ] Cancelled booking: reminder job no-ops.
