# Full-scale 05 — Integrations, notifications, webhooks

## 1. Calendar

- Dedicated **Calendar sync service**.
- Google: persistent channels, exponential backoff, per-user concurrency limits, incremental `syncToken`, 410 → full.
- Microsoft: Graph delta + subscriptions.
- CalDAV / iCloud as a third adapter.
- Conflict policy options per org: `block` (default), `warn`, `auto-cancel-external-optional` (never auto-cancel paid without flag).
- Write path: outbox → Temporal activity with retry; Meet/Teams/Zoom as `ConferenceProvider` ports.

## 2. Notifications

- Template CMS (org-overridable with required variables).
- Channels: email, SMS, WhatsApp (Twilio), push (Web Push + mobile later), Slack incoming for hosts.
- Preference center for invitees (`manage` page).
- Localization of templates.
- Provider waterfall (Resend → SES).
- Quiet hours in invitee TZ.

## 3. Webhooks

- Kafka → dispatcher with **ordered** per endpoint.
- At-least-once, 24h+ retry, disable after N failures, notify developer.
- mTLS optional, OAuth client credentials to customer (enterprise).
- Debug UI with payload redaction.
- Event catalog versioned; `booking.confirmed.v2` additive.

## 4. Developer platform

- Official SDKs (TS, Python).
- OAuth apps (not only API keys) for multi-tenant SaaS integrators.
- Sandbox orgs with Stripe test + fake calendar.
- `/v2` cursor pagination, webhooks signatures v2 (ed25519) while v1 HMAC remains.

## 5. Migration

MVP worker handlers become consumers. pg-boss timers → Temporal schedules. Keep HMAC v1 forever (or 2 years).
