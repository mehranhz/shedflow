# Wave 15 — Documents, calendar sync & reminders (customer) (T-073 … T-076)

**Design:** `mvp/06-calendar-integration.md` (host-centric today), `mvp/07-notifications.md`, `full-scale/05-integrations-notifications-webhooks.md`  
**Goal:** Intake forms/waivers, customer-side calendar sync, and a coherent reminder experience tied to the portal.  
**Backend:** `shedflow-back` (Laravel). **Does not duplicate:** T-016/T-017 **host** Google/Outlook busy sync; T-025/T-026 email reminders (extend, don’t rebuild).

---

## T-073 — Intake forms, waivers & questionnaires

**Status:** TODO  
**Depends on:** T-043, T-011  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- Org-defined `FormTemplate` (JSON schema of fields) attachable to EventType (`requiredBeforeConfirm`).
- Customer completes at book or via `/portal/forms/:assignmentId`.
- Store `FormSubmission` with version pin; signature / waiver checkbox + `signedAt` + IP + userAgent for audit.
- Block CONFIRMED transition when required form incomplete (or allow PENDING until done — pick one and document; prefer block confirm / show Actions needed).
- File uploads: signed URLs; MIME allowlist.

### Acceptance

- [ ] Booking with required waiver cannot be confirmed until submitted.
- [ ] Resubmission creates new version; staff sees latest (T-079).
- [ ] Idempotent submit with Idempotency-Key.

### Tests

- API state machine; Playwright complete form → confirm path.

---

## T-074 — Customer calendar sync (Google / Outlook / ICS)

**Status:** TODO  
**Depends on:** T-043, T-016 patterns  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- Customer OAuth connections **separate** from host calendar connections (new table `customer_calendar_connections`).
- On booking confirmed/rescheduled/cancelled: write/update/delete event on customer calendar (attendee copy).
- Always offer **ICS download** and `webcal://` feed token (read-only personal feed of future bookings) as baseline even without OAuth.
- Disconnect revokes tokens; encrypt at rest like T-016.
- Outlook behind same flag patterns as T-017 if reused.

### Acceptance

- [ ] ICS feed lists only the authenticated customer’s bookings.
- [ ] Fake Google provider writes event on confirm in tests.
- [ ] Tokens never logged.

### Tests

- Provider unit + feed auth e2e.

---

## T-075 — Reminder UX alignment & SMS opt-in

**Status:** TODO  
**Depends on:** T-057, T-026, T-072  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- Portal copy explains 24h/1h email reminders; link to notification prefs.
- SMS channel: store opt-in consent (TCPA-style timestamp); only send if org SMS enabled **and** customer opted in **and** phone present.
- Push: Web Push keys env-gated; subscribe from portal; respect quiet hours.
- Receipt-rejected / still-pending reminder deep-links to `/portal/payments` or appointment detail (not Stripe pay).

### Acceptance

- [ ] SMS never sent without consent row.
- [ ] Quiet hours suppress non-critical push/SMS (email policy documented).
- [ ] Inbox notification created alongside reminder when portal flag on.

### Tests

- Worker preference/consent matrix.

---

## T-076 — Documents vault (customer)

**Status:** TODO  
**Depends on:** T-073, T-061  
**Apps:** `shedflow-back`, `apps/client`

### Implementation

- `/portal/documents`: submitted forms, **uploaded payment receipts** (links to own files from Wave 4), waivers, org-shared files (policies). No Stripe invoice PDFs.
- Search + filter by business; download audit log.
- Retention: honor org retention + user delete (T-077).

### Acceptance

- [ ] Customer sees only own documents + org-published docs.
- [ ] Empty state when none.
- [ ] Mobile-friendly list with download affordance.

### Tests

- IDOR download attempts fail; Playwright list.
