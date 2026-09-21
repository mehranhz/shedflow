# Wave 14 — Favorites, family, waitlist & engagement (T-066 … T-072)

**Design:** `full-scale/03-scheduling-at-scale.md` §7 (waitlist), `full-scale/05-integrations-notifications-webhooks.md` §2, `00-product-scope.md` Phase-2 cuts  
**Goal:** Sticky engagement features mature scheduling SaaS customers expect: favorites, dependents, waitlist/alerts, light messaging, reviews, referrals.  
**Does not duplicate:** T-031 staff CRM; guest booking questions.

---

## T-066 — Favorites: staff, services, locations

**Status:** TODO  
**Depends on:** T-042, T-046  
**Apps:** `packages/db`, `apps/api`, `apps/client`

### Implementation

- Tables: `customer_favorites` (`organizationId`, `customerId`, `kind`, `refId`) unique.
- API list/add/remove; portal “Favorites” on home + quick book.
- Preferred staff: when event type allows host preference (may require event_type_hosts later) — if single-host only, favorite is bookmark for rebook UX only.

### Acceptance

- [ ] Favorite persists across sessions; remove works.
- [ ] Tenant-scoped; cannot favorite other org refs.

### Tests

- API CRUD + IDOR.

---

## T-067 — Family / dependents / multi-profile

**Status:** TODO  
**Depends on:** T-043, T-055  
**Apps:** `packages/db`, `apps/api`, `apps/client`

### Implementation

- `Dependent` (or `CustomerProfile`) under owning `User`: name, DOB optional, relationship, notes; link bookings via `booking.metadata.dependentId` or FK.
- Portal: switch “Booking for” self vs dependent; manage dependents under account.
- Consent: guardian attestation checkbox for minors; **block sexualized content** N/A — but store age gate if DOB present (policy: dependents < 18 require guardian user).
- Staff CRM shows dependent name on booking (T-079).

### Acceptance

- [ ] Book for dependent; list filters by profile.
- [ ] Delete dependent soft-hides; historical bookings retain display name snapshot.
- [ ] Max dependents configurable (default 10).

### Tests

- E2e book-for-child; validation on empty name.

---

## T-068 — Waitlist & availability alerts

**Status:** TODO  
**Depends on:** T-043, T-012, T-057  
**Apps:** `packages/db`, `apps/api`, `apps/worker`, `apps/client`  
**Note:** Group capacity waitlist is Phase 2; this task ships **1:1 cancellation waitlist / open-slot alerts** which works on MVP exclusion bookings.

### Implementation

- Join waitlist for event type + date preference window OR “next available”.
- On `booking.cancelled` / slot free: notify FIFO with 15m claim hold (Temporal optional — pg-boss OK).
- Availability alert: notify when any slot appears in window (rate-limited digest).
- Portal UI `/portal/waitlist`.

### Acceptance

- [ ] Cancel frees slot → first waitlisted customer notified once; claim books or expires.
- [ ] Preference opt-out respected (T-057).
- [ ] Idempotent notifications (`notification_logs` unique key).

### Tests

- Worker simulation with frozen clock; e2e claim race → one winner.

---

## T-069 — Messaging / support threads (lightweight)

**Status:** TODO  
**Depends on:** T-042, T-025  
**Apps:** `packages/db`, `apps/api`, `apps/worker`, `apps/client`

### Implementation

- `SupportThread` + `SupportMessage` per (organization, customer); customer + staff participants.
- Customer portal inbox; staff reply in CRM (T-079) or email fallback.
- No real-time WS required — poll 15s on open thread.
- Abuse: rate limit, max attachment size, basic profanity optional skip.
- Outbox email on new message.

### Acceptance

- [ ] Customer can open thread on a booking and receive staff reply email.
- [ ] Cannot read other customers’ threads.

### Tests

- API IDOR; email enqueue unit.

---

## T-070 — Reviews & ratings

**Status:** TODO  
**Depends on:** T-050  
**Apps:** `packages/db`, `apps/api`, `apps/client`

### Implementation

- Post-appointment review (1–5 + text) after `endAt`; one per booking; edit window 7d.
- Moderation: staff hide flag; public org page optional aggregate (feature flag).
- Request review email job 2h after end.

### Acceptance

- [ ] Cannot review before end or twice.
- [ ] Hidden reviews excluded from public aggregate.

### Tests

- API rules unit; Playwright submit review.

---

## T-071 — Referral & loyalty (product-light)

**Status:** TODO  
**Depends on:** T-063, T-057  
**Apps:** `apps/api`, `apps/billing`, `apps/client`  
**Flag:** `customer_referrals`

### Implementation

- Per-customer referral code; attribute new customer first paid booking; grant credit or coupon via ledger.
- Loyalty points optional stretch — prefer **referral credits** only for DoD.
- Portal: share link + status of referrals (no PII of referees beyond count).

### Acceptance

- [ ] Flag off → disabled.
- [ ] Flag on → self-referral rejected; double-award prevented (idempotent).

### Tests

- Fraud cases unit tests.

---

## T-072 — In-app notifications center

**Status:** TODO  
**Depends on:** T-057, T-046  
**Apps:** `packages/db`, `apps/api`, `apps/client`

### Implementation

- `UserNotification` inbox: type, title, body, href, readAt, organizationId?.
- Bell icon on portal shell with unread badge; mark read / mark all.
- Fan-in from waitlist, messages, payment failed, reminder (optional mirror).
- Web Push optional behind flag — document; email remains source of truth.

### Acceptance

- [ ] Creating a waitlist offer inserts inbox row + email.
- [ ] Mark read is idempotent.
- [ ] Mobile sheet for notification list.

### Tests

- API pagination; Playwright badge clears.
