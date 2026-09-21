# Wave 12 — Customer account & profile settings (T-055 … T-060)

**Design:** `mvp/10-security-and-privacy.md`, `mvp/15-i18n-a11y-compliance.md`, `full-scale/06-security-compliance.md` §1  
**Goal:** Enterprise-grade **account settings** for end customers: identity, preferences, security, privacy, sessions.  
**Does not duplicate:** T-032 org settings (staff), T-034 `/v1/me` staff export/erase (extend carefully for customer-only users).

---

## T-055 — Profile identity & contact

**Status:** TODO  
**Depends on:** T-042, T-046  
**Apps:** `apps/api`, `apps/client`

### Implementation

- UI `/portal/account/profile`: name, phone, photo URL (optional), default timezone, locale/language.
- Email change: request → verify token → update `User.email` + re-link Customers by new email strategy documented (prefer verify-then-merge).
- Per-business profile overrides: display name/phone on `Customer` row when active org selected (“How {Acme} sees you”).
- PATCH with `updatedAt` / ETag conflict handling.

### Acceptance

- [ ] Saving profile updates `GET /v1/customer/me` and future bookings’ invitee name.
- [ ] Invalid phone / TZ rejected with field errors.
- [ ] MEMBER staff settings pages unchanged.

### Tests

- API validation + Playwright save profile.

---

## T-056 — Preferences: timezone, language, accessibility

**Status:** TODO  
**Depends on:** T-055, T-047  
**Apps:** `apps/client`, `apps/api`

### Implementation

- Preference center section:
  - Timezone (IANA Command combobox)
  - Language (next-intl locales)
  - Accessibility: reduce motion (persist `prefers-reduced-motion` override), denser text optional, high-contrast follow system
- Persist on `User` settings JSON (`settings.portal`) and honor on portal shell.
- Booking SlotPicker defaults to profile TZ when logged in.

### Acceptance

- [ ] Changing language re-renders portal strings without full account recreate.
- [ ] `prefers-reduced-motion: reduce` or user toggle disables non-essential animation.

### Tests

- RTL preference persistence; axe after language switch.

---

## T-057 — Notification channel preferences

**Status:** TODO  
**Depends on:** T-055, T-025  
**Apps:** `apps/api`, `apps/worker`, `apps/client`

### Implementation

- Model `NotificationPreference` (user-scoped, optional per-organization overrides):
  - channels: email (default on), SMS (off until Twilio enabled), push (off until T-072)
  - categories: booking reminders, marketing, receipts, waitlist alerts, messages
  - quiet hours in user TZ
- Worker checks preferences before send; transactional **security** emails (reset password, claim) never suppressed.
- UI `/portal/account/notifications` with clear “required for account security” labels.

### Acceptance

- [ ] Opting out of reminders skips `reminder.send` for that user; confirmations still send unless explicitly allowed to opt out (product: confirmations remain on).
- [ ] Marketing default **off** until explicit consent (T-075).
- [ ] Audit preference changes.

### Tests

- Worker unit: preference gate; API PATCH e2e.

---

## T-058 — Security: password, 2FA, sessions & devices

**Status:** TODO  
**Depends on:** T-055, T-004  
**Apps:** `apps/api`, `apps/client`

### Implementation

- Change password (current + new); revoke other sessions option.
- List refresh sessions: device/user-agent, IP (coarse), last used, revoke one / revoke all.
- **2FA (TOTP)** for customers: enroll, verify, backup codes; step-up on password change & email change.
- Optional passkey / WebAuthn stretch — document as follow-up if out of slice; TOTP is required for this task’s DoD.
- Linked accounts placeholder (Google/Apple OAuth) — UI “Coming soon” **or** implement Google OIDC if calendar OAuth patterns reusable; do not block on Apple.

### Acceptance

- [ ] Enrolled 2FA required on login; backup code works once.
- [ ] Revoke session invalidates that refresh family member.
- [ ] Rate-limit 2FA attempts.

### Tests

- Auth e2e for TOTP enroll/login; session revoke.

---

## T-059 — Privacy, consent & linked businesses list

**Status:** TODO  
**Depends on:** T-055, T-034  
**Apps:** `apps/api`, `apps/client`

### Implementation

- `/portal/account/privacy`:
  - Marketing consent toggles (timestamped)
  - Privacy policy / terms links
  - List linked businesses with “Disconnect” (unlink `Customer.userId` but **do not** delete host CRM row)
  - Entry points to export / delete (T-075 implements fulfillment)
- Store consents in append-only consent log for auditability.

### Acceptance

- [ ] Disconnect removes business from switcher; historical bookings remain for host.
- [ ] Consent changes write audit + consent log.

### Tests

- Unlink e2e; consent log assertion.

---

## T-060 — Account settings IA polish & mobile forms

**Status:** TODO  
**Depends on:** T-055 … T-059  
**Apps:** `apps/client`

### Implementation

- Settings index with sections; deep links from home (“Complete your profile”).
- Unsaved-changes guard; inline validation; success toasts.
- Loading/error/empty for sessions list and businesses list.

### Acceptance

- [ ] All account routes usable on 390px width without horizontal scroll.
- [ ] Axe serious/critical clean on profile + security pages.

### Tests

- Playwright account tour; axe suite portal account.
