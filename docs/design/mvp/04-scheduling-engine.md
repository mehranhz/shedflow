# MVP 04 — Scheduling engine

This is the product core. All times in this document are processed in UTC internally. User-facing zones are IANA names (`America/New_York`). Use `date-fns` and `@date-fns/tz` (`TZDate`). **Do not use** `moment`, `luxon`, or `Date#setHours` with a guessed offset.

## 1. Domain objects

| Object | Meaning |
| --- | --- |
| Schedule | Named weekly template + date overrides in **one** IANA timezone (`schedule.timezone`). |
| AvailabilityRule | Local-time window on a weekday: `[startMinute, endMinute)` from midnight. Multiple rules per day (e.g. 09–12 and 13–17) are allowed; they must not overlap. |
| DateOverride | A specific **calendar date** in the schedule TZ: either fully unavailable or a replacement window. Overrides **replace** that day's weekly rules, they do not union. |
| EventType | Duration, buffers, notice windows, slot step, daily cap, location, optional price/credits, questions. Points at one schedule + one host. |
| Slot | Bookable `[start, end)` UTC instant pair. `end = start + duration`. Displayed in the **invitee** timezone. |
| Busy block | Interval that cannot overlap a new booking's **occupied** range (booking + buffers, or external calendar event). |

MVP: **1:1 events only**. One host, capacity 1. Group/round-robin/waitlist are Phase 2 (`full-scale/03-scheduling-at-scale.md`).

## 2. Slot generation algorithm

Function: `AvailabilityService.listSlots(input) → { slots, timezone, stale }`.

```ts
type ListSlotsInput = {
  organizationId: string;
  eventTypeIdOrSlug: string;
  rangeStart: Date; // UTC, inclusive
  rangeEnd: Date;   // UTC, exclusive
  inviteeTimeZone: string; // IANA, validated
};
```

### 2.1 Validate

1. Event type exists, `isActive`, belongs to org.
2. `inviteeTimeZone` in `Intl.supportedValuesOf('timeZone')` (Node 20+). Else `INVALID_TIMEZONE`.
3. Clamp `rangeStart` to `max(now + minNotice, rangeStart)`.
4. Clamp `rangeEnd` to `min(startOfDay(now, schedule.tz) + maxDaysAhead days, rangeEnd)`.
5. Reject ranges longer than 31 days (`400`).
6. If `rangeEnd <= rangeStart`, return `{ slots: [] }`.

### 2.2 Build local working days

Iterate each calendar date `d` from local date of `rangeStart` to local date of `rangeEnd` **in `schedule.timezone`** (not invitee TZ — rules are defined in the host's schedule TZ).

For each `d`:

1. If a `DateOverride` exists:
   - `isUnavailable` → skip the day.
   - else use `[[startMinute, endMinute]]`.
2. Else use all `AvailabilityRule` rows for `dayOfWeek(d)` (0=Sun).
3. Convert each local window to UTC instants using `TZDate`:
   - `windowStart = tz(d, startMinute)` → UTC
   - `windowEnd = tz(d, endMinute)` → UTC
   - If DST spring-forward makes local time invalid, **skip that window** (log `warn`).
   - If DST fall-back is ambiguous, pick the **earlier** offset (standard for "opening time").

### 2.3 Generate candidate starts

- `step = slotIntervalMinutes || durationMinutes`.
- For `t = windowStart; t + duration <= windowEnd; t += step`:
  - candidate = `[t, t + duration)`.
  - Drop if `t < now + minNotice`.
  - Drop if `t` outside `[rangeStart, rangeEnd)`.

### 2.4 Load busy set (one query batch)

Occupied ranges that conflict:

1. Bookings for `hostUserId` where `status ∈ (PENDING_PAYMENT, PENDING_CONFIRMATION, CONFIRMED)` and `occupied && [rangeStart - maxBuffer, rangeEnd + maxBuffer)`.
2. `external_busy_blocks` for that host overlapping the same padded range (only calendars with `conflictCheck = true`).

Each candidate is dropped if `tstzrange(t - bufferBefore, t+duration + bufferAfter) && busy`.

Also apply **daily cap**: count existing bookings for that event type whose `startAt` falls on local date `d` in schedule TZ; if `count >= dailyCap`, skip remaining candidates that day.

### 2.5 Output

Return slots sorted by `startAt`, mapped to invitee TZ for `startLocal` / `endLocal` ISO strings **and** UTC `startAt`/`endAt`. Cap at 500 slots; if truncated set `truncated: true`.

```json
{
  "timezone": "Europe/Berlin",
  "stale": false,
  "truncated": false,
  "slots": [
    {
      "startAt": "2026-09-14T13:00:00.000Z",
      "endAt": "2026-09-14T14:00:00.000Z",
      "startLocal": "2026-09-14T15:00:00+02:00",
      "endLocal": "2026-09-14T16:00:00+02:00"
    }
  ]
}
```

Cache: Cloudflare 30 s on GET URL. Application cache: in-memory LRU **not** required in MVP; DB is enough at 100k bookings/month.

Stale calendar: if `lastSyncedAt` for any conflict calendar is older than 60 s, the request **may** call Google `freebusy.query` with a 2 s timeout (see `06`). On timeout/error, use DB blocks and `stale: true`. Never fail the slot query because Google is down.

## 3. Creating a booking (double-booking prevention)

`POST /v1/public/bookings` and authenticated `POST /v1/organizations/:orgId/bookings`.

Body:

```json
{
  "eventTypeSlug": "intro",
  "startAt": "2026-09-14T13:00:00.000Z",
  "timezone": "Europe/Berlin",
  "invitee": { "name": "Ada Lovelace", "email": "ada@example.com", "phone": "+1…" },
  "answers": { "q1": "Need help with X" },
  "source": "HOSTED"
}
```

Requires `Idempotency-Key`.

### 3.1 Transaction (api)

```
BEGIN
  lock event type row (SELECT … FOR SHARE) so duration/buffers cannot change mid-flight
  validate questions, timezone, event active
  upsert customer on (organization_id, lower(email))
  endAt = startAt + duration
  INSERT booking (
    uid, status, buffers copied from event type,
    holdExpiresAt = now()+15m if paid else null,
    status = paid ? PENDING_PAYMENT
            : requiresConfirmation ? PENDING_CONFIRMATION
            : CONFIRMED
  )
COMMIT
```

If the exclusion constraint fires, Prisma/pg throw; map to `SLOT_UNAVAILABLE` (409). **Do not** check-then-insert without the constraint — two concurrent requests would both pass the check.

Paid path: after commit, call billing `POST /internal/checkout-sessions`. If billing/Stripe fails: leave booking `PENDING_PAYMENT` (expiry job will free it) and return `502 UPSTREAM_UNAVAILABLE` with `booking.uid` so the client can retry checkout (`POST /v1/public/bookings/:uid/checkout`).

Credit path (membership): before insert, `POST /internal/credits/consume`. If 422 `INSUFFICIENT_CREDITS`, abort. On exclusion-constraint failure after consume, `POST /internal/credits/release`. Prefer: consume **after** successful insert via billing looking at `booking.confirmed` — actually **consume inside the same user-facing flow after insert succeeds**, and if consume fails, cancel the booking in the same request. Credits are not in the api transaction (different owner). Sequence:

1. Insert hold as `PENDING_PAYMENT` **or** a new status? Simpler: for credit bookings insert `PENDING_CONFIRMATION` without payment, then consume; on success set `CONFIRMED`; on failure delete/cancel booking (status `EXPIRED`) so exclusion releases.

Free + auto-confirm: insert `CONFIRMED`, outbox `booking.confirmed`.

### 3.2 Occupied range

Copied buffers freeze the conflict window even if the event type is later edited.

## 4. Cancel

Invitee: signed link `POST /v1/public/bookings/:uid/cancel` `{ token, reason? }`.
Host: `POST /v1/organizations/:orgId/bookings/:id/cancel` `{ reason? }`.

Rules:

- Already `CANCELLED`/`EXPIRED`/`RESCHEDULED` → 409 `CONFLICT`.
- Invitee must be ≥ `cancellationNoticeHours` before `startAt` unless host cancels (host always may).
- `CONFIRMED` / `PENDING_CONFIRMATION` → `CANCELLED`, outbox `booking.cancelled`.
- `PENDING_PAYMENT` → `CANCELLED`, billing expires Checkout Session.
- If payment succeeded and policy says refund: host-only flag `refund: true` → billing refund (Pro). Default: **no automatic refund** on invitee cancel; host can refund from dashboard.
- Credit bookings: `credits.release` for that `bookingId` if still in current period.

## 5. Reschedule

`POST …/reschedule` `{ token?, startAt, timezone }`.

Rules: same notice window as cancel. Implementation:

1. Insert **new** booking `CONFIRMED` (or previous status) with `rescheduledFromId`.
2. If exclusion fails → 409, old booking untouched.
3. Set old booking `RESCHEDULED` (frees exclusion because status not in active set).
4. Outbox `booking.rescheduled` `{ fromId, toId }`.
5. Paid: **do not** re-charge. Credit: do not consume a second credit (new row linked; ledger stays).
6. Calendar: worker deletes old event, writes new.

Never mutate `start_at` in place: the exclusion constraint and calendar sync are simpler with append-only history.

## 6. Manual confirmation

If `requiresConfirmation`: insert `PENDING_CONFIRMATION`. Host `POST …/confirm`. Outbox `booking.confirmed` only then. Expiry: if still pending 48 h after create **or** at `startAt - minNotice`, expire.

## 7. Signed action links

On `booking.confirmed` / `pending_*`, insert three `SignedActionToken` rows (manage, cancel, reschedule), TTL = `endAt + 30d`. Emails contain `APP_URL/b/{uid}/manage?token=`. Tokens hashed at rest (SHA-256). One-time for cancel; reschedule token reusable until used-to-completion or expiry. Manage page is read-only + buttons.

HMAC alternative (`HMAC(bookingId+purpose+exp, ENCRYPTION_KEY)` as URL token) is acceptable **instead of** the table if we do not need revocation. Prefer the table so hosts can invalidate.

## 8. REST surface

```
# authenticated
GET    /v1/organizations/:orgId/schedules
POST   /v1/organizations/:orgId/schedules
GET    /v1/organizations/:orgId/schedules/:id
PATCH  /v1/organizations/:orgId/schedules/:id
DELETE /v1/organizations/:orgId/schedules/:id
PUT    /v1/organizations/:orgId/schedules/:id/rules      // replace-all weekly rules
PUT    /v1/organizations/:orgId/schedules/:id/overrides/:date
DELETE /v1/organizations/:orgId/schedules/:id/overrides/:date

GET    /v1/organizations/:orgId/event-types
POST   /v1/organizations/:orgId/event-types
GET    /v1/organizations/:orgId/event-types/:id
PATCH  /v1/organizations/:orgId/event-types/:id
DELETE /v1/organizations/:orgId/event-types/:id          // soft: isActive=false

GET    /v1/organizations/:orgId/bookings
GET    /v1/organizations/:orgId/bookings/:id
POST   /v1/organizations/:orgId/bookings                 // host-created
POST   /v1/organizations/:orgId/bookings/:id/cancel
POST   /v1/organizations/:orgId/bookings/:id/reschedule
POST   /v1/organizations/:orgId/bookings/:id/confirm
POST   /v1/organizations/:orgId/bookings/:id/no-show

GET    /v1/organizations/:orgId/customers
GET    /v1/organizations/:orgId/customers/:id
PATCH  /v1/organizations/:orgId/customers/:id

# public
GET    /v1/public/orgs/:orgSlug
GET    /v1/public/orgs/:orgSlug/event-types
GET    /v1/public/orgs/:orgSlug/event-types/:eventSlug
GET    /v1/public/orgs/:orgSlug/event-types/:eventSlug/slots?from&to&tz
POST   /v1/public/bookings
GET    /v1/public/bookings/:uid
POST   /v1/public/bookings/:uid/checkout
POST   /v1/public/bookings/:uid/cancel
POST   /v1/public/bookings/:uid/reschedule
```

## 9. Default schedule on org create

Mon–Fri `startMinute=540` (09:00), `endMinute=1020` (17:00), timezone = org timezone, `isDefault=true`, name `"Working hours"`. Host = creator.

## 10. Edge cases (must have tests)

| Case | Expected |
| --- | --- |
| Two concurrent POSTs same slot | One 201, one 409 |
| DST spring-forward (US 02:30) | Slot not generated |
| DST fall-back duplicate local hour | One slot at earlier offset |
| Invitee TZ `Asia/Kolkata` (offset :30) | Slots still on host grid; display in Kolkata |
| `minNotice` 60m, now 10:10, duration 30, step 30 | First slot ≥ 11:10 aligned to grid |
| Buffer 15 after, next candidate 15m later | Dropped |
| `PENDING_PAYMENT` hold | Slot hidden; after expiry appears again |
| Event type deactivated mid-page | POST 404/409 |
| Host deleted membership | Event types inactive; existing bookings remain |
| 24h availability `0–1440` | Allowed; watch DST |
| Overlapping weekly rules | `400 VALIDATION_ERROR` on PUT rules |
| Daily cap 2, third slot that day | Not listed; POST 409 |

## 11. Out of scope (do not implement)

Waitlists, capacity > 1, collective availability (union of hosts), round-robin, recurring invitee bookings, "schedule a time with anyone on the team".
