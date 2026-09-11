# MVP 07 — Notifications

**Service:** `apps/worker` consumes outbox events and sends messages.  
**Email:** Resend. **SMS:** Twilio behind a port, **disabled until `TWILIO_ACCOUNT_SID` is set** (do not block launch). **Push:** Phase 2.

## 1. Pipeline

```
domain_events (PENDING)
  → outbox.relay (every 1s, FOR UPDATE SKIP LOCKED, batch 50)
  → pg-boss job named after event type
  → handler enqueues notification / calendar / webhook / reminder jobs
  → mark PROCESSED (or FAILED + available_at backoff, max 10)
```

Handlers are **idempotent** (notification_logs unique on `(bookingId, template, channel)` where bookingId not null).

## 2. Email templates (`packages/emails`, React Email)

| Template | Trigger | To |
| --- | --- | --- |
| `booking-confirmed-host` | `booking.confirmed` | host |
| `booking-confirmed-invitee` | `booking.confirmed` | invitee (+ `.ics`) |
| `booking-pending-host` | `booking.created` PENDING_CONFIRMATION | host |
| `booking-cancelled-host` | `booking.cancelled` | host |
| `booking-cancelled-invitee` | `booking.cancelled` | invitee |
| `booking-rescheduled-*` | `booking.rescheduled` | both |
| `reminder-24h` / `reminder-1h` | scheduled jobs | both |
| `payment-receipt` | `payment.succeeded` | invitee |
| `payment-failed` | `invoice.payment_failed` / `payment.failed` | invitee + host |
| `verify-email` / `reset-password` / `invitation` | auth events | user |
| `calendar-reconnect` | connection invalid | host |

`.ics` (`text/calendar`): `METHOD:REQUEST` on confirm/reschedule, `METHOD:CANCEL` on cancel. UID = `booking.uid@schedflow.com`. Include `ORGANIZER`, `ATTENDEE`, `DTSTART/DTEND` UTC, `SEQUENCE` increment on reschedule.

From: `EMAIL_FROM` e.g. `SchedFlow <notifications@mail.schedflow.com>`. Reply-To: host email.

No template CMS in MVP. Copy is English; `next-intl`/org locale can wait — if `org.locale !== 'en'` still send English (documented). Subject lines in the TSX files.

## 3. Reminders

On `booking.confirmed`, schedule pg-boss jobs `reminder.send` with `startAfter = startAt - 24h` and `startAt - 1h`, payload `{ bookingId, template }`. Job no-ops if status ≠ `CONFIRMED` or `startAt` changed (compare payload `startAt`). Reschedule: cancel previous jobs via `singletonKey: reminder:{bookingId}:{template}` (pg-boss replaces).

If `startAt` is within 24h at confirm time, skip 24h; if within 1h, skip both (the confirm email is enough).

## 4. SMS (optional)

`SmsProvider.send(to, body)`. Templates are 160-char summaries. Only if `org.settings.notifications.smsEnabled` and invitee phone present. Cost: org's problem in Phase 2; MVP we pay Twilio from platform and **do not expose SMS in UI** unless env enabled for dogfood.

## 5. Rendering & sending

`Mailer` port → `ResendMailer`. HTML + text. Log `notification_logs`. On Resend 4xx (bad address), mark FAILED, do not retry. 5xx/timeout: throw, pg-boss retries (1m, 5m, 25m, 2h, 8h).

## 6. Booking expiry / revive jobs

| Job | When |
| --- | --- |
| `booking.expire` | `startAfter = holdExpiresAt` |
| `booking.revive` | `payment.succeeded` but booking `EXPIRED` |
| `watch.renew` | daily |
| `idempotency.purge` | daily, delete expired keys |
| `outbox.relay` | every 1s |

## 7. Failure modes

Never fail the HTTP booking request because email failed — email is async. If outbox insert fails, the transaction rolls back (good). If relay crashes after send before PROCESSED, handler idempotency prevents duplicate emails (Resend + our log). Prefer `Idempotency-Key` header to Resend (`bookingId+template`).
