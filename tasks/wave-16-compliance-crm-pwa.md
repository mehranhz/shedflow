# Wave 16 — Multi-business, compliance, PWA & complementary CRM (T-077 … T-082)

**Design:** `mvp/10-security-and-privacy.md`, `mvp/15-i18n-a11y-compliance.md`, `full-scale/06-security-compliance.md`  
**Goal:** Close enterprise gaps: multi-business UX, GDPR DSR from the portal, offline/PWA, a11y/analytics hardening, and **staff CRM** views needed so portal mutations are operable by the business.  
**Does not duplicate:** T-034 staff/user GDPR endpoints (extend), T-037 Playwright baseline (add portal suites), T-039 a11y polish (portal-specific).

---

## T-077 — GDPR: customer data export, delete account, marketing consent enforcement

**Status:** TODO  
**Depends on:** T-059, T-034, T-043  
**Apps:** `apps/api`, `apps/worker`, `apps/client`

### Implementation

- Portal UI wired to:
  - `GET /v1/customer/export` — all linked Customer rows, bookings summaries, consents, payments metadata (no staff notes unless policy says copy).
  - `DELETE /v1/customer/account` — revoke sessions, anonymize User, unlink; **host** bookings remain with anonymized invitee per T-034 rules.
- Async export for large accounts via outbox + email download link (short TTL).
- Marketing sends require consent check in worker.
- SLA fields: `requestedAt`, `completedAt` on DSR request table for audit.

### Acceptance

- [ ] Export ZIP/JSON contains bookings across businesses for seed customer.
- [ ] Delete prevents further login; refresh revoked.
- [ ] Host still sees anonymized historical booking.
- [ ] Rate-limit delete/export.

### Tests

- E2e export shape; delete + login failure; host booking anonymized assertion.

---

## T-078 — PWA, offline shell & deep link hardening

**Status:** TODO  
**Depends on:** T-046, T-049  
**Apps:** `apps/client`

### Implementation

- Web app manifest for `/portal` (name, icons, `start_url`, display standalone).
- Service worker: cache shell + offline fallback page; **network-first** for API (no stale bookings as truth).
- “Offline” banner when navigator.onLine false; queue non-critical UI prefs in localStorage.
- iOS/Android add-to-home-screen docs in client README.
- Ensure email deep links open correct portal routes when installed as PWA.

### Acceptance

- [ ] Lighthouse PWA installable in Chromium (or documented manual checklist).
- [ ] Offline visit shows fallback, not blank white screen.
- [ ] No service worker on staff `/dashboard` unless explicitly shared carefully (prefer portal-only scope).

### Tests

- Playwright offline emulation smoke; manifest link present.

---

## T-079 — Staff complementary CRM for portal features

**Status:** TODO  
**Depends on:** T-067, T-069, T-073, T-031  
**Apps:** `apps/client`, `apps/api`

### Implementation

Staff dashboard enhancements (only what’s needed to operate portal data):

- Customer detail: linked portal user badge, dependents, favorites, waitlist entries, form submissions, open message threads, credit/gift balances.
- Booking detail: customer note, dependent name, review rating.
- Reply to support thread; hide review; view waiver PDF.
- RBAC: MEMBER limited to own host’s bookings; ADMIN/OWNER full CRM.
- Audit staff reads of sensitive export bundles.

### Acceptance

- [ ] OWNER can reply to customer message and customer sees it in portal.
- [ ] MEMBER cannot access other hosts’ customer message threads if product rule says so (document).
- [ ] No regression to T-031 booking actions.

### Tests

- Playwright staff reply → customer inbox; RBAC e2e.

---

## T-080 — Multi-business UX polish & conflict UX

**Status:** TODO  
**Depends on:** T-042, T-049, T-061  
**Apps:** `apps/client`

### Implementation

- Global “All businesses” home aggregating upcoming across orgs with clear branding chips.
- Cross-org action routing sets active org then navigates.
- Empty org state after disconnect; invite-to-book search by slug (optional).
- Handle timezone differences across businesses in relative time labels.

### Acceptance

- [ ] Customer with 2 orgs sees both next appointments on All view.
- [ ] Tapping an item switches context correctly for mutations.

### Tests

- Multi-org fixture Playwright.

---

## T-081 — Portal analytics, rate limits, idempotency audit

**Status:** TODO  
**Depends on:** T-047, T-043, T-008  
**Apps:** `apps/api`, `apps/client`

### Implementation

- Verify every customer mutating route: Idempotency-Key required or documented exception (GETs).
- Rate limit catalog for portal auth, claim, book, message, review.
- Analytics schema doc + server-side events for funnel (`customer_registered`, `customer_claimed`, `customer_booked`).
- Conflict error envelope consistency (`SLOT_UNAVAILABLE`, `CONFLICT`, `OUTSIDE_POLICY`).

### Acceptance

- [ ] Checklist in task file signed off with route table.
- [ ] Load test notes (k6 script optional) for claim + book.

### Tests

- Interceptor tests for missing idempotency on POST cancel; metrics labels present if T-035 hooks exist.

---

## T-082 — Portal E2E, a11y & launch checklist

**Status:** TODO  
**Depends on:** T-077 … T-081, T-037  
**Apps:** `apps/client`, CI

### Implementation

- Playwright projects: customer happy path (claim → home → book → cancel → pay visibility → export).
- Axe on portal home, appointments, account, payments.
- CI job or extend existing Playwright workflow with seed customer.
- Launch checklist markdown under `tasks/` or `docs/runbooks/customer-portal.md`: flags, seed users, mobile QA matrix.

### Acceptance

- [ ] CI green with portal smoke (or documented `E2E_PORTAL=1` gate).
- [ ] No axe critical/serious on listed routes.
- [ ] README lists owner + customer seed credentials (from T-044).

### Tests

- The suite itself is the test.
