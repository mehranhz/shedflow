# Stripe webhooks behind

1. Stripe Dashboard → Developers → Webhooks → failed deliveries. Retry.
2. Confirm `STRIPE_WEBHOOK_SECRET` vs Connect secret (`STRIPE_CONNECT_WEBHOOK_SECRET`).
3. Raw body enabled on `/webhooks/stripe`.
4. `SELECT * FROM stripe_events ORDER BY created_at DESC LIMIT 20;`
5. Payment succeeded but booking EXPIRED → revive path (T-021) must run; else manual `POST /internal/bookings/:id/confirm`.
