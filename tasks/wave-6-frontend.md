# Wave 6 — Frontend (T-027 … T-032)

**Design:** `docs/design/mvp/08-frontend.md`  
**Rule:** only shadcn components from `@shedflow/ui`. Add primitives to `packages/ui` first, export from `src/components/index.tsx`. Restyle existing login/register to `Button` + `Input` + `Label` (they currently use raw `<input>`).

TanStack Query, react-hook-form, zod resolvers — add to `apps/client`.

---

## T-027 — Hosted booking page

**Status:** DONE  
**Depends on:** T-011, T-012, T-014, T-015, T-021 (paid redirect; can stub if billing missing)  
**Apps:** `apps/client`

### Implementation

- Routes: `[orgSlug]/page.tsx`, `[orgSlug]/[eventSlug]/page.tsx`, `b/[bookingUid]/{success,manage,cancel,reschedule}`.
- SSR event type + org branding (`--brand`).
- Client `SlotPicker`: timezone Command, Calendar, time buttons, form, Idempotency-Key uuid.
- Calls `NEXT_PUBLIC_API_URL/v1/public/*` from the browser for slots/book (documented exception).
- Paid: redirect `checkoutUrl`. Success page confirms status (poll GET public booking).
- Manage page: token query param, cancel/reschedule forms (`AlertDialog`).
- Metadata title `{event} · {org}`.
- Loading skeletons, empty month, SLOT_UNAVAILABLE toast (`sonner`).

### shadcn to add (minimum)

`button`, `input`, `label`, `calendar`, `popover`, `command`, `select`, `card`, `badge`, `alert`, `alert-dialog`, `sonner`, `skeleton`.

### Acceptance

- [x] Can complete a **free** booking without logging in (Playwright in T-037; until then manual + component doesn't crash).
- [x] Invalid TZ handled (picker only lists IANA).
- [x] Keyboard: can book without mouse (Radix calendar + buttons).
- [x] `?embed=1` hides chrome.

---

## T-028 — Embed widget

**Status:** DONE  
**Depends on:** T-027  
**Apps:** `apps/embed` (new)

### Implementation

- Vite IIFE `embed.js` per `08` §5. Inline + popup, postMessage resize/close/booked.
- Next headers CSP `frame-ancestors *` **only** on `/embed/*` and public booking with embed query.
- Document snippet on dashboard event type (T-030).
- Bundle size check in README (target < 8 KB gz).

### Acceptance

- [x] Static HTML fixture in `apps/embed/demo.html` loads inline iframe against local client.
- [x] Popup closes on Esc and on `schedflow:booked`.

---

## T-029 — Dashboard shell, onboarding, BFF, restyle auth

**Status:** DONE  
**Depends on:** T-006, T-007  
**Apps:** `apps/client`, `packages/ui`  
**Design:** `08` §2–§3, §6

### Implementation

- Install remaining shadcn: `sidebar`, `dropdown-menu`, `avatar`, `separator`, `sheet`, `tooltip`, `breadcrumb`, `tabs`, `table`, `dialog`, `switch`, `textarea`, `checkbox`, `progress`, `scroll-area`.
- `(dashboard)/layout.tsx`: `AppSidebar`, org switcher, user menu, `SignOutButton`.
- `proxy.ts` matcher: all dashboard paths.
- BFF `app/api/bff/api/[...path]/route.ts` and `bff/billing/[...path]/route.ts`.
- Onboarding page checklist (`08` §3) using `settings.onboarding` via PATCH org.
- Restyle login/register with shadcn; keep NextAuth flow.
- Overview page: counts (may 0).
- Providers: `QueryClientProvider` + `Toaster`.

### Acceptance

- [ ] Logged-in user sees sidebar and org name.
- [ ] Zero event types → onboarding CTAs.
- [ ] MEMBER does not see Team/Billing/Developer links (hide in UI; API still enforces).
- [ ] Login/register use `@shedflow/ui` Button/Input.

---

## T-030 — Event types and availability UI

**Status:** DONE  
**Depends on:** T-029, T-010, T-011

### Implementation

- Event types table, create/edit form (all fields in `02` EventType except Stripe ids if FREE). Copy public link + embed snippet.
- Availability weekly editor + date overrides + timezone Command.
- Toasts on save. Zod schemas from `@shedflow/shared`.

### Acceptance

- [x] Create event type, see it on public booking page.
- [x] Change Friday hours, slots on booking page reflect after refresh.
- [x] FREE fourth event type shows upgrade Alert.

---

## T-031 — Bookings and customers UI

**Status:** DONE  
**Depends on:** T-029, T-014, T-015, T-013

### Implementation

- Bookings table + filters + detail sheet (actions cancel/reschedule/confirm/no-show).
- Poll 30s (`refetchInterval`).
- Customers table + detail + booking history.
- Refund button only if T-023 and OWNER/ADMIN (calls billing BFF).

### Acceptance

- [x] Host-created booking appears in table.
- [x] Cancel from sheet updates status without full reload (invalidate query).

---

## T-032 — Billing, team, settings, developer UI

**Status:** DONE  
**Depends on:** T-029, T-019, T-020, T-024, T-006  
**Developer keys UI can land with T-033** — settings/team/billing first; developer tab empty state until T-033.

### Implementation

- Billing: Connect status, onboard button, products/prices, payments table, upgrade to Pro (redirect Checkout), tax switch.
- Team: members, invite, pending, role change.
- Settings: name, slug (OWNER), timezone, currency, brand color, logo URL, danger delete.
- Empty Developer page with “upgrade” if FREE.

### Acceptance

- [x] Invite flow: send invite (email logged), second user accepts, appears in members.
- [x] Brand color appears on hosted booking page.
- [x] Pro upgrade button hits billing BFF (fake URL ok in test env).
