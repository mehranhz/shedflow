# MVP 06 — Calendar integration (Google, Outlook)

## 1. Scope

| Provider | MVP |
| --- | --- |
| Google Calendar | **Required for launch.** OAuth, list calendars, conflict check, write booking events, Google Meet, push notifications + 5 min poll fallback. |
| Microsoft 365 / Outlook | **Launch-optional** (feature flag `outlook_calendar`). Same behaviour when enabled. Pro plan. |

CalDAV, iCloud, Zoom, Teams: Phase 2.

## 2. Ports

```ts
type Busy = { start: Date; end: Date; externalEventId: string; etag?: string };

abstract class CalendarProvider {
  readonly name: "GOOGLE" | "MICROSOFT";
  abstract getAuthUrl(state: string): string;
  abstract exchangeCode(code: string): Promise<Tokens & { accountEmail: string; scopes: string[] }>;
  abstract refresh(tokens: Tokens): Promise<Tokens>;
  abstract listCalendars(tokens: Tokens): Promise<{ externalId: string; name: string; primary: boolean }[]>;
  abstract freeBusy(tokens: Tokens, calendarIds: string[], from: Date, to: Date): Promise<Busy[]>;
  abstract incrementalSync(tokens: Tokens, calendarId: string, syncToken?: string): Promise<{
    upserts: Busy[];
    deletes: string[];
    nextSyncToken: string;
  }>;
  abstract createEvent(tokens: Tokens, calendarId: string, input: CalendarEventInput): Promise<{ externalEventId: string; meetUrl?: string }>;
  abstract updateEvent(...): Promise<void>;
  abstract deleteEvent(...): Promise<void>;
  abstract watch(tokens: Tokens, calendarId: string): Promise<{ channelId: string; resourceId: string; expiresAt: Date }>;
  abstract stopWatch(...): Promise<void>;
}
```

Tokens at rest: AES-256-GCM with `ENCRYPTION_KEY` (`common/crypto/envelope.ts`). Never log them.

## 3. OAuth (Google)

- Scopes: `https://www.googleapis.com/auth/calendar.events`, `calendar.readonly`, `userinfo.email`. Meet links need events scope.
- `access_type=offline`, `prompt=consent` the first time so we always get a refresh token.
- State: signed JWT `{ userId, organizationId, provider, nonce, exp }` (5 min).
- Routes:
  - `GET /v1/organizations/:orgId/calendar/google/start` → 302 to Google
  - `GET /v1/calendar/google/callback` `@Public()` — verify state, exchange, upsert `calendar_connections`, list calendars, set primary as `conflictCheck` + `writeTarget`, enqueue `calendar.full_sync`
- Disconnect: `DELETE /v1/organizations/:orgId/calendar/connections/:id` — stop watch, delete busy blocks, wipe tokens.

Google Cloud Console: authorized redirect `API_URL/v1/calendar/google/callback` and prod URL. Restrict to the SchedFlow project.

## 4. Conflict detection

Slot generation reads `external_busy_blocks` (see `04` §2.4). Worker keeps them fresh:

1. **Push:** Google watch channel on each conflict calendar. Webhook `POST /webhooks/google-calendar` `@Public()`. Headers `X-Goog-Channel-ID`, `X-Goog-Resource-State`. On `sync`/`exists`, enqueue `calendar.incremental_sync` for that connection. Channels expire ~7 days — job `calendar.renew_watch` daily.
2. **Poll fallback:** every 5 minutes per connection (`singletonKey: conn:{id}` in pg-boss) run incremental sync.
3. **Live freebusy** on slot query if `lastSyncedAt > 60s` (2 s timeout). Merge into memory for that request; optionally upsert blocks.

All-day and transparent (`transparency=transparent`) Google events are **not** busy. `status=cancelled` → delete block.

Write target calendar is also conflict-checked (the event we wrote would otherwise not be in busy blocks until sync). When we create an event, insert a local busy block immediately in the same worker job.

## 5. Writing bookings

On `booking.confirmed` (and reschedule/cancel):

| Booking locationType | Google event |
| --- | --- |
| `GOOGLE_MEET` | `conferenceData.createRequest` with `conferenceSolutionKey.type=hangoutsMeet`; store `hangoutLink` on `bookings.location_value` |
| `LINK` / `CUSTOM` | `location` = value |
| `PHONE` | description includes phone |
| `IN_PERSON` | `location` = address |

Event description includes invitee name/email, answers, cancel/reschedule links. Attendees: host + invitee (`sendUpdates=all`). Extended property `private.schedflowBookingId = booking.id` for idempotent upserts.

Cancel → `events.delete`. Reschedule → `events.patch` times (or delete+create if Meet link must rotate — **patch** is enough).

If Google returns 401: refresh token; if refresh fails, mark connection `invalid`, email the host, skip write, booking still valid.

## 6. Microsoft (when flag on)

- Azure app, delegated `Calendars.ReadWrite`, `offline_access`, `User.Read`.
- Auth code + PKCE.
- Graph `calendarView` / delta query for sync; `/users/me/calendar/getSchedule` for freebusy.
- Create event with `isOnlineMeeting` only if we later add Teams (not MVP). Outlook location types: same mapping, no Meet.
- Subscriptions (`/subscriptions`) for push; fallback poll.

## 7. Conflict resolution policy

SchedFlow booking vs later Google event overlapping: we do **not** auto-cancel the booking. Host sees a dashboard warning (`stale`/overlap job nightly). Phase 2 may offer auto-cancel. Slot query uses Google as source of busy, so **new** bookings will not double-book once sync lands.

Two write calendars: exactly one `writeTarget` per connection; UI enforces.

## 8. Failure modes

| Event | Behaviour |
| --- | --- |
| Refresh token revoked | Connection `needsReauth`; banner in dashboard |
| Watch webhook spoofed | Ignore unknown `channelId` |
| Partial sync 410 (syncToken invalid) | Full sync |
| Meet creation fails | Create event without Meet; locationType stays GOOGLE_MEET; host notified |

## 9. Tests

Mock `CalendarProvider`. Unit-test mapping of Google events → busy blocks (all-day, declined, tentatives: **tentative counts as busy**). E2E with recorded fixtures, not live Google, in CI.
