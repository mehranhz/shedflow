# Full-scale 03 — Scheduling at scale

## 1. What is added vs MVP

| Feature | Behaviour |
| --- | --- |
| Group events | `capacity > 1`; occupancy is a **counter** per slot, not binary exclusion |
| Round-robin / collective | Pool of hosts; collective = intersection of free slots; RR = least-recently-booked host among those free |
| Waitlist | On full group slot, join waitlist; on cancel, offer with 15 m hold |
| Buffer across event types | Occupancy keyed by host, already |
| Recurring invitee series | N bookings with shared `seriesId`; fail the batch if any slot conflicts (all-or-nothing) |
| Routing forms | Intake → event type mapping |
| Multi-host event types | `event_type_hosts` table |

## 2. Occupancy ledger

```
INSERT INTO occupancy (host_id, range, booking_id, state)
```

Group: `seat_counts(event_type_id, range, taken)` with `CHECK taken <= capacity` and `UPDATE … WHERE taken < capacity`.

CRDB `REGIONAL BY ROW`; transactions in org home region. Gateway routes commands using org→region map (cached).

## 3. Slot materializer

Workers per partition:

- On schedule change: recompute next `maxDaysAhead` days for affected event types (bounded).
- On occupancy: delete that UTC start from Redis set.
- On calendar busy: subtract ranges.

Algorithm internally is the same as MVP `04` §2 but **asynchronous** and precomputed. Live compute remains a fallback if cache miss (p95 budget allows one PG read).

## 4. DST / TZ

Same rules as MVP. Materializer uses `schedule.timezone`. Add property tests (fast-check) over a year of DST transitions for 20 popular zones.

## 5. Hot keys

Celebrity hosts: sharded occupancy by `host_id` (already). Redis slots keys fan-out. Rate-limit public slot GET per event type.

## 6. Double-booking prevention

Never rely on cache. POST booking always hits occupancy DB. Cache is optimization.

## 7. Waitlist algorithm

FIFO per `(eventType, startAt)`. On release, Temporal workflow: notify first, hold 15 m, skip to next on expire. Idempotent.

## 8. Migration from MVP

Ship group events on **MVP Postgres gist** first (partial unique doesn't work for counts) — actually gist exclusion is binary. Group events **require** the seat_count model; introduce it in Booking service before Kubernetes if needed. Roadmap step in `11`.
