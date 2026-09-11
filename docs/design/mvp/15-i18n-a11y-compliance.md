# MVP 15 — i18n, localization, accessibility, compliance

## 1. i18n / l10n

| Surface | MVP |
| --- | --- |
| Product UI (dashboard, booking) | **English only** in shipped copy |
| Dates/times | `Intl.DateTimeFormat` with invitee or org timezone |
| Numbers / money | `Intl.NumberFormat` with org currency |
| Org `locale` field | stored, unused for catalogs; default `en` |
| Emails | English (`packages/emails`) |
| RTL | not supported |

`next-intl` is **not** required to launch. Add `lang="en"` on `<html>`. Booking page may set `lang={org.locale}` if it is a BCP-47 tag we know (`en`, `en-GB`); unknown → `en`.

Phase 2: message catalogs, email locale, RTL.

## 2. Time zones

IANA only. Booking page TZ picker. Host schedule TZ independent of invitee TZ (`04`).

## 3. Accessibility (WCAG 2.1 AA **intent**, pragmatic bar)

- shadcn/Radix primitives (keyboard, roles) — do not replace with unlabelled `<div onClick>`.
- Form fields have `<Label htmlFor>`.
- Errors: `Alert` + `aria-live="polite"`.
- Calendar slot grid: `role="listbox"` / buttons with `aria-label` including full datetime.
- Contrast: default theme already; custom `--brand` must pick `--brand-foreground` black or white by luminance.
- Focus visible.
- Playwright axe scan on login + booking page (T-037); fix serious/critical.

Not a VPAT in MVP.

## 4. Compliance matrix

| Regime | MVP posture |
| --- | --- |
| PCI DSS | SAQ A via Stripe Checkout/Connect hosted. No PAN/CVC. |
| GDPR | `10-security-and-privacy.md` export/erasure, privacy page, subprocessors. |
| UK GDPR / PECR | same; marketing email = none in MVP. |
| CCPA | erasure + privacy page; no sale of data. |
| CAN-SPAM | transactional only; include org name; no unsub required for transactional. |
| Accessibility law | best-effort AA on booking path. |
| SOC 2 / ISO 27001 | Phase 2. |
| HIPAA | **not** offered. BAA out of scope. Do not market to covered entities. |

## 5. Cookies

NextAuth session (necessary). No advertising cookies. Cookie banner **not** required if only strictly necessary — document that. If we add analytics later, gate it.

## 6. Legal pages (static)

`apps/client/app/(public)/legal/{privacy,terms}/page.tsx` — placeholder lawyer copy marked `DRAFT — have counsel review before charging money`. Footer links. Launch blocker: counsel review, not the routing.
