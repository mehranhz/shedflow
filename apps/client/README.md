# SchedFlow client (Next.js)

## Dev

```bash
# from repo root
cp .env.example .env   # once
docker compose up -d postgres
pnpm db:migrate && pnpm db:seed
pnpm dev               # client :3000, api :3001
```

Demo seed (T-036): `owner@shedflow.dev` / `Password123!`, org `acme`, events `intro` (free) + `coaching`.

Customer seed (T-044): `customer@shedflow.dev` / `Password123!` → `/portal/login` (skip portal E2E until present).

## Customer portal PWA (T-078)

Portal-only installable web app under `/portal`:

- Manifest: `/portal/manifest.webmanifest`
- Service worker: `/portal/sw.js` with **scope `/portal/`** (staff `/dashboard` is never claimed)
- Offline fallback: `/portal/offline`
- Non-critical UI prefs: `localStorage` key `shedflow.portal.uiPrefs`

### Add to Home Screen

| Platform | Steps |
| --- | --- |
| Android Chrome | Open `/portal` → browser menu → **Install app** / **Add to Home screen** |
| iOS Safari | Open `/portal` → Share → **Add to Home Screen** |
| Desktop Chromium | Omnibox install icon when manifest + SW are valid |

Email deep links should target `/portal/...` paths so an installed PWA opens the correct route.

## Playwright smoke + a11y (T-037)

Requires migrated + seeded DB and `pnpm dev` (or equivalent) with API healthy at `E2E_API_URL` (default `http://localhost:3001`).

```bash
# install browser once (CI / unrestricted networks)
pnpm --filter client test:e2e:install
# or: ./apps/client/node_modules/.bin/playwright install chromium

# if Playwright CDN is geo-blocked, use system Edge/Chrome:
#   Windows PowerShell: $env.PLAYWRIGHT_CHANNEL='msedge'
#   bash: export PLAYWRIGHT_CHANNEL=msedge

pnpm --filter client test:playwright
# or: cd apps/client && pnpm exec playwright test
# root alias: pnpm test:e2e:playwright
```

Suites in `e2e/`:

| Spec | What |
| --- | --- |
| `a11y.spec.ts` | axe-core on `/login` and `/acme/intro` (fail on critical/serious) |
| `smoke.spec.ts` | seed login → book Intro → cancel; register → create event → book → cancel |
| `portal.spec.ts` | portal manifest/offline + axe; happy path skips without T-044 seed (`E2E_PORTAL=1` to emphasize) |

If the API is down, tests **skip** (not fail) unless `E2E_REQUIRE_STACK=1` (CI sets this).

Env overrides: `PLAYWRIGHT_BASE_URL`, `E2E_API_URL`, `PLAYWRIGHT_CHANNEL`, `E2E_PORTAL`.

Launch checklist: [`docs/runbooks/customer-portal.md`](../../docs/runbooks/customer-portal.md).

### k6 (not in CI)

```bash
k6 run -e BASE_URL=http://localhost:3001 -e ORG=acme -e EVENT=intro tests/load/slots.js
```

See `tests/load/slots.js`, `tests/load/customer-portal.notes.ts`, and `docs/design/mvp/13-testing-strategy.md` §6.
