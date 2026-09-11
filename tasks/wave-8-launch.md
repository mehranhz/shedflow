# Wave 8 — Launch hardening (T-034 … T-039)

---

## T-034 — GDPR export/erasure + privacy/terms pages

**Status:** TODO  
**Depends on:** T-006, T-013, T-014  
**Design:** `mvp/10-security-and-privacy.md` §6, `mvp/15` §6

### Implementation

- `GET /v1/me/export`, `DELETE /v1/me`.
- `GET/DELETE /v1/organizations/:orgId/customers/:id` + `…/export`.
- Anonymize rules in `10`.
- Booking form stores `metadata.privacyAcceptedAt` (T-027 checkbox — add if missing).
- Pages `legal/privacy`, `legal/terms` marked DRAFT.
- Footer links on client.

### Acceptance

- [ ] Customer delete anonymizes email; booking row remains for the host.
- [ ] User delete revokes refresh tokens (cannot refresh).

---

## T-035 — Observability: pino, Prometheus, OTel, Sentry, alerts, Grafana port

**Status:** TODO  
**Depends on:** T-003, T-009, T-018  
**Design:** `mvp/11-observability-and-operations.md`, `mvp/12` Grafana port conflict

### Implementation

- `nestjs-pino` on api, billing, worker with requestId.
- `prom-client` `/metrics` (protect with no auth on private network; do not expose publicly in Fly without filter).
- Histogram metrics listed in `11` §3.
- OTel SDK optional if env set.
- Sentry optional if DSN set.
- Move Grafana host port **3300:3000** in compose; document.
- Scrape jobs in `prometheus.yml`.
- `observability/prometheus/alerts/shedflow.yml` + runbooks in `docs/runbooks/`.
- Dashboard JSON provision.

### Acceptance

- [ ] `curl localhost:3001/metrics` includes `http_request_duration_seconds`.
- [ ] Login request logs JSON with `requestId`.
- [ ] Grafana on 3300; Next on 3000 without conflict.

---

## T-036 — CI, Dockerfiles, env completeness, seed

**Status:** TODO  
**Depends on:** T-001  
**Design:** `mvp/12-infrastructure-cicd-dr.md`

### Implementation

- `.github/workflows/ci.yml`: lint, test, e2e with Postgres service, build.
- Dockerfiles for api, billing, worker.
- `engines.node` >= 22.13 in root `package.json`.
- Seed `packages/db/prisma/seed.ts` (`02` §9).
- `.env.example` complete (`01` §7).
- `docs/runbooks/provision.md` click-ops for Fly/Vercel/Neon/Stripe/Google.
- `docker-compose.prod.yml` optional.

### Acceptance

- [ ] CI workflow file is valid YAML and would run unit tests.
- [ ] `pnpm --filter @shedflow/db seed` creates demo user.
- [ ] Image builds: `docker build -f apps/api/Dockerfile .` (document context).

---

## T-037 — Playwright smoke + k6 script + a11y

**Status:** TODO  
**Depends on:** T-027, T-029, T-014  
**Design:** `mvp/13-testing-strategy.md`, `mvp/15` §3

### Implementation

- Playwright: register → onboarding skip if needed → create event type → public book free → manage cancel.
- Axe on login + booking (serious/critical = fail).
- `tests/load/slots.js` k6 documented, not in CI.
- Concurrent double-book e2e already in T-014 — keep.

### Acceptance

- [ ] `pnpm exec playwright test` smoke passes locally against `pnpm dev` + migrated DB (document in `apps/client/README` or `tasks`).
- [ ] Axe no critical.

---

## T-038 — Feature flags + platform impersonation

**Status:** TODO  
**Depends on:** T-006, T-003  
**Design:** `mvp/11` §9–§10

### Implementation

- `isEnabled(flag, org)` from env `FLAGS` + `org.settings.flags`.
- `POST /v1/platform/impersonate` only if `PLATFORM_ADMINS` contains email. JWT claim `impersonatingOrgId`. Dashboard banner.
- Audit every impersonated request.
- If `PLATFORM_ADMINS` empty, route 404.

### Acceptance

- [ ] Empty allowlist → no impersonation.
- [ ] Allowlisted user impersonates, sees org B data, audit row written.

---

## T-039 — Accessibility/i18n baseline polish

**Status:** TODO  
**Depends on:** T-027, T-029  
**Design:** `mvp/15-i18n-a11y-compliance.md`

### Implementation

- `lang` on html; booking `lang={org.locale}` whitelist.
- Money/dates via `Intl`.
- Brand luminance → `--brand-foreground`.
- Labels on all dashboard forms touched in T-030–T-032 (fix leftovers).
- Focus visible already from shadcn — verify slot buttons have `aria-label` with full datetime.

### Acceptance

- [ ] Slot button accessible name includes date and time.
- [ ] Low-luminance brand uses white foreground.
- [ ] No extra i18n framework required.
