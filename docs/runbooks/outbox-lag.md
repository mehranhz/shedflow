# Outbox lag

**Symptom:** `outbox_pending` high; emails/webhooks late.

1. Worker `/health` and logs. pg-boss schema exists?
2. `SELECT status, count(*) FROM domain_events GROUP BY 1;`
3. FAILED rows: inspect `last_error`; fix; `UPDATE domain_events SET status='PENDING', available_at=now() WHERE id=…`.
4. Poison: keep FAILED, skip.
5. Scale worker replicas only after singleton keys exist for calendar poll (T-016).
