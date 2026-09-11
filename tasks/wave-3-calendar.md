# Wave 3 — Calendar (T-016, T-017)

**Design:** `docs/design/mvp/06-calendar-integration.md`

---

## T-016 — Google Calendar OAuth, sync, conflict, write

**Status:** TODO  
**Depends on:** T-009, T-014, T-015  
**Apps:** `apps/api`, `apps/worker`

### Implementation

- Prisma `CalendarConnection`, `ConnectedCalendar`, `ExternalBusyBlock`.
- Envelope encryption helper `packages` or `apps/api/src/common/crypto` (AES-256-GCM, `ENCRYPTION_KEY` 32-byte base64).
- `CalendarProvider` port + `GoogleCalendarProvider`.
- Routes: start, callback, list/patch calendars (`conflictCheck`, `writeTarget`), disconnect.
- Worker jobs: `calendar.full_sync`, `calendar.incremental_sync`, `calendar.write` on `booking.confirmed|cancelled|rescheduled`, `calendar.renew_watch` daily, poll every 5m singleton.
- Webhook `POST /webhooks/google-calendar` public.
- Slot query: include busy blocks; optional freebusy if stale > 60s, 2s timeout, `stale: true` (`04` §2.5).
- `GOOGLE_MEET` conference on write; save link on booking `locationValue`.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_WEBHOOK_URL`.

### Acceptance

- [ ] Unit tests map Google events → busy (ignore transparent, cancelled; tentative = busy; all-day busy).
- [ ] Fake provider e2e: connected calendar busy block removes a slot.
- [ ] Booking confirmed enqueues write job (outbox → worker log).
- [ ] Tokens never appear in logs.
- [ ] Disconnect deletes busy blocks.

### Note

CI must not call real Google. Use fixtures.

---

## T-017 — Microsoft 365 calendar (launch-optional)

**Status:** TODO  
**Depends on:** T-016  
**Feature flag:** `outlook_calendar` + Pro plan

Same port, `MicrosoftCalendarProvider`, Graph APIs per `06` §6. Skip if flag off. Acceptance: analogous unit tests + OAuth start URL generated. Do not block MVP launch.
