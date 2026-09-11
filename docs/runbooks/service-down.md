# Service down

**Symptom:** `up{job="shedflow-api|billing|worker"} == 0` or `/health` fails.  
**Impact:** No dashboard and/or no bookings.

1. Check process/Fly metrics; last deploy.
2. `GET /health` — if `db: false`, check Neon/Postgres and `DATABASE_URL` (pooler vs direct).
3. Logs: crash loop, missing env (zod boot).
4. Rollback to previous image SHA (`docs/design/mvp/12-infrastructure-cicd-dr.md`).
5. If only worker: bookings still create; emails/calendar delayed — page if > 15 min.
