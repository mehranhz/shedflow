# Booking create failing

**Symptom:** 5xx or spike of `SLOT_UNAVAILABLE` / `UPSTREAM_UNAVAILABLE`.  
**Impact:** Invitees cannot book; possible unpaid holds.

1. Distinguish 409 `SLOT_UNAVAILABLE` (expected contention) vs 500.
2. Postgres: CPU, locks, `bookings_host_occupied_excl` errors.
3. Billing/Stripe status; Connect `chargesEnabled`.
4. Idempotency: clients retrying with new keys creating many `PENDING_PAYMENT` holds — expire job T-026.
5. Sentry trace for `POST /v1/public/bookings`.
