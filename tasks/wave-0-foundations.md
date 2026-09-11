# Wave 0 — Foundations (T-001 … T-005)

**Design:** `docs/design/mvp/01-architecture.md`, `02-data-model.md`, `03-api-and-auth.md`, `12-infrastructure-cicd-dr.md`

---

## T-001 — Move Prisma to `packages/db` and fix local URLs

**Status:** DONE  
**Depends on:** nothing  
**Apps:** `packages/db` (new), `apps/api`, root compose / env

### Goal

One Prisma schema + migrations consumed by api (later billing and worker). Fix Postgres port mismatch (`docker-compose.yml` maps **5434:5432**, `.env.example` still says 5432).

### Implementation

1. Create `packages/db` (`@shedflow/db`):
  - Move `apps/api/prisma/**`, `prisma.config.ts` here.
  - Generator output: `packages/db/src/generated/prisma` (gitignored).
  - Export `PrismaClient` factory + re-export types from `packages/db/src/index.ts`.
2. `apps/api` depends on `workspace:*`. `PrismaService` imports from `@shedflow/db`.
3. Root scripts `db:*` target `@shedflow/db`.
4. `.env.example`:
  ```
   DATABASE_URL=postgresql://shedflow:shedflow@localhost:5434/shedflow?schema=public
   TEST_DATABASE_URL=postgresql://shedflow:shedflow@localhost:5434/shedflow_test?schema=public
   DIRECT_DATABASE_URL=<same as DATABASE_URL locally>
  ```
5. Split compose profiles: `core` = postgres; `observability` = prometheus/grafana/… so `docker compose up -d postgres` is enough for app work. Default `docker compose up -d` may still start both, but document profiles.
6. `packages/db/README.md`: how to migrate, how to add raw SQL migrations that Prisma must not reverse (exclusion constraint later).



### Acceptance

- [x] `pnpm db:migrate` from repo root works against port 5434.
- [x] `pnpm --filter @shedflow/api test` and existing e2e still pass.
- [x] `apps/api/prisma` is gone (or re-exports only).
- [x] No Prisma generate output committed.

---



## T-002 — `@shedflow/shared` contracts

**Status:** DONE  
**Depends on:** T-001 (can start in parallel, merge after)  
**Apps:** `packages/shared`

### Goal

Runtime-shared types so api, billing, worker, client do not drift.

### Implementation

Package already exists (`SHEDFLOW_VERSION` only). Add (no Nest imports):

- `errors.ts` — union of error codes from `03-api-and-auth.md` §4
- `events.ts` — event name constants (`booking.confirmed`, …)
- `money.ts` — `{ amountMinor, currency }`, `assertMinor(n)`
- `time.ts` — `isValidTimeZone(tz: string)` using `Intl.supportedValuesOf('timeZone')`
- `page.ts` — duplicate of Page JSON shape (items, total, page, limit, pageCount)
- `flags.ts` — `outlook_calendar`, `sms`, …
- `org-settings.ts` — zod `OrgSettingsSchema`
- `questions.ts` — event type questions + answers zod
- `idempotency.ts` — header name, max length 64

Export from `src/index.ts`. Ensure `pnpm --filter @shedflow/shared build` emits `dist`. Wire api + client to depend on `workspace:*` (client may import types only).

### Acceptance

- [x] `pnpm --filter @shedflow/shared build` succeeds.
- [x] Error codes used in T-003 filter import from here.

---



## T-003 — API baseline: `/v1`, errors, CORS, helmet, rate limit, request id

**Status:** DONE  
**Depends on:** T-002  
**Apps:** `apps/api`  
**Design:** `mvp/03-api-and-auth.md`, `mvp/10-security-and-privacy.md`

### Implementation

- Global prefix `v1` **except** `auth` and `health`/`metrics` (use Nest `exclude` or mount AuthController outside prefix). NextAuth must keep `API_URL/auth/login` working — **do not break**.
- `AllExceptionsFilter`: envelope `{ error: { code, message, details, requestId } }`. Map `UniqueConstraintError` → 409, `EntityNotFoundError` → 404. Hide stacks.
- Middleware: generate `x-request-id`, echo it.
- `helmet`, CORS allow `APP_URL` (new env, default `http://localhost:3000`).
- `@nestjs/throttler` with limits from `03` §9 (start with global 300/min + stricter on login).
- `GET /health` `{ status: 'ok', db: true, version }` — public.
- `Clock` port: `abstract now(): Date`, `SystemClock`. Provide globally.
- Zod env validation on boot (`JWT_SECRET`, `DATABASE_URL`, `APP_URL`, `PORT`).
- Update `apps/client/lib/api.ts` so authenticated product calls use `/v1/...` later; auth paths unchanged.



### Acceptance

- [x] Existing login/register/dashboard still work.
- [x] Unauthenticated `GET /v1/does-not-exist` → 401 envelope (global JWT guard).
- [x] `GET /health` is public 200.
- [x] Validation errors return `VALIDATION_ERROR` + field details.

---



## T-004 — Refresh tokens and 15-minute access JWT

**Status:** DONE  
**Depends on:** T-001, T-003  
**Design:** `mvp/02-data-model.md` RefreshToken, `mvp/03` §5.1

### Implementation

- Prisma models `RefreshToken` (and migrate).
- JWT access TTL **15m**. Payload still `{ sub, email, typ: 'access' }` (org claims in T-007).
- `POST /auth/refresh` `{ refreshToken }` public; rotate; reuse of revoked hash revokes all user refresh tokens → 401.
- `POST /auth/logout` authenticated; revoke current refresh (body or header).
- Login/register also return `refreshToken` (raw once). Store **sha256** only.
- NextAuth (`apps/client/auth.ts`): persist `refreshToken`; in `jwt` callback if access near expiry, call `/auth/refresh`; `SESSION_MAX_AGE_SECONDS = 30 days`.
- Extend `types/next-auth.d.ts`.
- Unit tests: rotation, reuse detection. E2e: login → refresh → me.



### Acceptance

- [x] Access token expires in 15m (decode `exp`).
- [x] Reusing an old refresh token fails and invalidates the family.
- [x] Client session still authenticates `/auth/me` after simulated refresh (unit or e2e).

---



## T-005 — Email verification and password reset (tokens; send in T-025)

**Status:** DONE  
**Depends on:** T-001, T-003  
**Design:** `mvp/02` UserToken, `mvp/03` §5.2

### Implementation

- Prisma `UserToken`, `User.emailVerifiedAt`, `User.name`, `User.timezone`, `User.locale`, `User.deletedAt`.
- `POST /auth/forgot-password` always **204**.
- `POST /auth/reset-password` `{ token, password }` — 8+ chars; revoke all refresh tokens.
- `POST /auth/verify-email` `{ token }`.
- `POST /auth/resend-verification` authenticated.
- Hash tokens SHA-256; TTL 1h reset / 24h verify.
- On register, create verify token. **Do not** enqueue email until worker exists; `console`/`Logger` the APP_URL link in development (`NODE_ENV=development` only).
- Client pages: `reset-password`, `verify-email` using shadcn `Button`, `Input`, `Alert`, `AuthShell`.
- Unverified users **are allowed** to use the app.



### Acceptance

- [x] Forgot-password does not reveal whether email exists.
- [x] Reset with valid token changes password; old password fails login.
- [x] Verify sets `emailVerifiedAt`.
- [x] Token reuse → 400.