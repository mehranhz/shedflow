# MVP 08 — Frontend (dashboard, hosted booking page, embed)

**App:** `apps/client` (Next.js 16 App Router, React 19, Tailwind 4).  
**UI:** `@shedflow/ui` **shadcn/ui only** — do not introduce another component library. Add primitives to `packages/ui` as needed; apps import from `@shedflow/ui/components`.  
**Embed:** `apps/embed` Vite IIFE `embed.js`.

Auth is done (login/register/dashboard stub, NextAuth, `apiFetch`). This document specifies the rest of the client.

## 1. shadcn inventory

Install into `packages/ui` (aliases already in `components.json`; fix `css` path to `src/styles/global.css`). Export every primitive from `src/components/index.tsx`.

**Required for MVP:** `button`, `input`, `label`, `textarea`, `select`, `checkbox`, `switch`, `radio-group`, `form` (react-hook-form), `card`, `dialog`, `alert-dialog`, `dropdown-menu`, `popover`, `tooltip`, `tabs`, `table`, `badge`, `avatar`, `separator`, `skeleton`, `sonner` (toast), `calendar`, `command`, `sheet`, `sidebar`, `breadcrumb`, `pagination`, `progress`, `scroll-area`, `accordion` (exists), `alert` (exists).

Icons: `lucide-react` (already a ui dependency).

Forms: `react-hook-form` + `@hookform/resolvers` + zod from `@shedflow/shared`.

Data: TanStack Query v5. Server Components fetch initial page data via `apiFetch`; client components use Query for refetch (bookings list, slots).

## 2. Route map

```
app/
  layout.tsx                         # fonts, Providers (Session + Query + Toaster)
  page.tsx                           # marketing mini-landing (exists)
  (auth)/
    login/ register/                 # exists; restyle with shadcn Button/Input
    reset-password/page.tsx
    verify-email/page.tsx
    invite/[token]/page.tsx
  (dashboard)/
    layout.tsx                       # auth required, org required, AppSidebar
    onboarding/page.tsx              # if org has 0 event types
    [orgSlug]/
      page.tsx                       # overview
      event-types/page.tsx
      event-types/[id]/page.tsx
      availability/page.tsx
      bookings/page.tsx
      bookings/[id]/page.tsx
      customers/page.tsx
      customers/[id]/page.tsx
      billing/page.tsx
      team/page.tsx
      settings/page.tsx
      developer/page.tsx
  (public)/
    [orgSlug]/page.tsx               # org profile: list public event types
    [orgSlug]/[eventSlug]/page.tsx   # hosted booking
    b/[bookingUid]/
      success/page.tsx
      manage/page.tsx
      cancel/page.tsx
      reschedule/page.tsx
      pay/page.tsx                   # redirect leftover
  embed/[orgSlug]/[eventSlug]/page.tsx  # same booking UI, chrome-less (?embed=1)
```

`proxy.ts` matcher: protect `(dashboard)` paths. Public booking is open.

Org switcher sets cookie `sf_org` + `POST /v1/organizations/:id/switch`.

## 3. Dashboard IA

**Sidebar** (`Sidebar` shadcn): logo, org switcher (dropdown), links (Overview, Event types, Availability, Bookings, Customers, Billing, Team, Developer, Settings), user menu (theme toggle optional, sign out). MEMBER does not see Team/Billing/Developer/Settings billing tabs.

**Onboarding checklist** (Overview until complete): (1) org name/tz (2) connect calendar (3) working hours (4) first event type (5) copy link (6) connect Stripe if Pro. Persist `settings.onboarding` flags.

**Overview:** today's bookings, next 7 days count, empty state CTA.

**Event types:** table + “New event type” dialog/page. Fields per `02`/`04`. Copy link, toggle active. Price select from billing catalog (Pro).

**Availability:** weekly grid editor (7 rows, time range chips, add split shift). Date override popover (calendar + unavailable or custom hours). Timezone select (`Intl` list, searchable Command).

**Bookings:** filters (status, event type, date range), table, row → detail sheet (invitee, answers, pay status, cancel/reschedule/confirm/no-show, refund button). Poll every 30 s or on focus (no websocket in MVP).

**Customers:** table, detail with booking history + credit balance (billing BFF).

**Billing:** Connect onboarding button + status; products/prices CRUD; payments table; platform plan upgrade (Stripe Checkout redirect); Stripe tax switch.

**Team:** members table, invite form (email + role), pending invitations.

**Settings:** org profile, branding (color picker, logo URL), locale/currency, cancellation policy defaults, danger zone.

**Developer:** API keys (create shows secret once), webhook endpoints, recent deliveries.

Visual: use `Card`, `Table`, `Badge` for status (`CONFIRMED` green, `PENDING_PAYMENT` yellow, `CANCELLED` muted). Toasts for mutations.

## 4. Hosted booking page (SSR)

`generateMetadata` from event type title. Server-render org branding (`brandColor` as CSS variable `--brand`, logo, name). Client island `SlotPicker`:

1. Timezone combobox (default: browser TZ).
2. Month calendar (shadcn Calendar); days without slots disabled (fetch month slots once).
3. Selected day → time buttons.
4. Form: name, email, phone optional, questions.
5. Submit → `POST /v1/public/bookings` with Idempotency-Key (uuid per attempt).
6. Free: `/b/{uid}/manage`. Paid: `window.location = checkoutUrl`.

Accessibility: keyboard-complete calendar, `:focus-visible`, contrast on brand color (if luminance low, force white text). `lang` from org locale.

Embed mode (`?embed=1` or `/embed/...`): no marketing chrome, `X-Frame-Options` allow parents; CSP `frame-ancestors *` only on this route (default deny elsewhere).

Theming: CSS variables `--brand`, `--brand-foreground`. Pro can hide “Powered by SchedFlow”.

## 5. Embed widget (`apps/embed`)

`embed.js` usage:

```html
<script src="https://cdn.schedflow.com/embed.js" async></script>
<div class="schedflow-inline" data-org="acme" data-event="intro"></div>
<button data-schedflow-popup data-org="acme" data-event="intro">Book</button>
```

- Inline: iframe `APP_URL/embed/{org}/{event}`.
- Popup: modal iframe, trap focus, Esc closes, `postMessage` `{ type: 'schedflow:close' | 'schedflow:booked', uid }`.
- Resize: iframe `postMessage` height.
- Bundle < 8 KB gz, no React.

`next.config` headers for embed routes: `Content-Security-Policy: frame-ancestors *`.

## 6. BFF

`app/api/bff/api/[...path]/route.ts` → `API_URL/v1/...`  
`app/api/bff/billing/[...path]/route.ts` → `BILLING_URL/v1/...`

Forward cookies session → Bearer. Browser dashboard **only** calls `/api/bff/...` (except public slots on booking page).

## 7. States every screen must handle

Loading (Skeleton), empty, error (Alert destructive + retry), forbidden (upgrade CTA for Pro), 401 (sign out).

## 8. What not to build

Mobile native apps, live occupancy websockets, drag-and-drop calendar editor, full marketing site, dark-mode perfection beyond CSS variables already in `global.css`.
