# Wave 6 — Frontend (T-027 … T-032)

**Design:** `docs/design/mvp/08-frontend.md`  
**Rule:** only shadcn components from `@shedflow/ui`. Add primitives to `packages/ui` first, export from `src/components/index.tsx`. Restyle existing login/register to `Button` + `Input` + `Label` (they currently use raw `<input>`).

TanStack Query, react-hook-form, zod resolvers — add to `apps/client`.

**API target:** Laravel `shedflow-back`. Stripe Checkout / billing BFF paths are **deferred** — Wave 4 adds receipt upload on booking + event-type toggles; remove or inert `checkoutUrl` / pay-page as primary UX.

---

## T-027 — Hosted booking page

**Status:** DONE (extend in Wave 4 T-020 for receipt upload)  
**Depends on:** T-011, T-012, T-014, T-015; receipt UX → T-020  
**Apps:** `apps/client`

### Implementation

- Routes: `[orgSlug]/page.tsx`, `[orgSlug]/[eventSlug]/page.tsx`, `b/[bookingUid]/{success,manage,cancel,reschedule}`.
- SSR event type + org branding (`--brand`).
- Client `SlotPicker`: timezone Command, Calendar, time buttons, form, Idempotency-Key uuid.
- Calls `NEXT_PUBLIC_API_URL/v1/public/*` from the browser for slots/book (documented exception).
- **Payments now:** when `requiresPaymentReceipt`, show upload step (T-020) — **do not** redirect Stripe `checkoutUrl`. Existing pay-booking page is deferred/legacy.
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

**Status:** DONE (receipt toggle → Wave 4 T-018)  
**Depends on:** T-029, T-010, T-011

### Implementation

- Event types table, create/edit form. `requiresConfirmation` switch exists. Add `requiresPaymentReceipt` in T-018; hide/disable Stripe `priceId` / credit-cost as primary path.
- Copy public link + embed snippet.
- Availability weekly editor + date overrides + timezone Command.
- Toasts on save. Zod schemas from `@shedflow/shared`.

### Acceptance

- [x] Create event type, see it on public booking page.
- [x] Change Friday hours, slots on booking page reflect after refresh.
- [x] FREE fourth event type shows upgrade Alert.
- [ ] Receipt requirement toggle (tracked under T-018).

---

## T-031 — Bookings and customers UI

**Status:** DONE (receipt preview → Wave 4 T-021)  
**Depends on:** T-029, T-014, T-015, T-013

### Implementation

- Bookings table + filters + detail sheet (actions cancel/reschedule/confirm/no-show).
- Poll 30s (`refetchInterval`).
- Customers table + detail + booking history.
- **Refund / Stripe billing BFF:** deferred (old T-023 OBSOLETE). Show payment **receipt** attachment for staff review in T-021.

### Acceptance

- [x] Host-created booking appears in table.
- [x] Cancel from sheet updates status without full reload (invalidate query).
- [ ] Staff can view uploaded receipt (T-021).

---

## T-032 — Billing, team, settings, developer UI

**Status:** DONE (team/settings); **Billing Stripe UI = DEFERRED / hide**  
**Depends on:** T-029, T-006  
**Developer keys UI can land with T-033** — settings/team first; developer tab empty until Laravel T-033.

### Implementation

- **Billing page:** Nest-era Stripe Connect/catalog/Pro Checkout is **out of scope**. Replace with short “Payment receipts are configured per event type” copy (link to event types) or hide nav item for MEMBER/non-owners until gateway returns.
- Team: members, invite, pending, role change.
- Settings: name, slug (OWNER), timezone, currency, brand color, logo URL, danger delete.
- Empty Developer page until Laravel API keys exist.

### Acceptance

- [x] Invite flow: send invite, second user accepts, appears in members.
- [x] Brand color appears on hosted booking page.
- [ ] Stripe Connect/Pro Checkout not required; billing nav does not imply live gateway.
