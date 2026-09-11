# Agent instructions (SchedFlow)

You are working in the **shedflow** monorepo (product name **SchedFlow**).

## Read first

1. [`docs/design/README.md`](docs/design/README.md) — architecture index  
2. [`tasks/README.md`](tasks/README.md) — MVP task index, waves, DoD  
3. The **one** task file in `tasks/wave-*.md` you are implementing

Do not implement `docs/design/full-scale/**` unless the user explicitly asks for Phase 2.

## Already built (do not rebuild)

- `apps/api` NestJS JWT auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Prisma persistence ports (`apps/api/src/common/persistence`)
- `apps/client` Next.js 16 + NextAuth v5 credentials; `apiFetch` + Bearer from session
- `@shedflow/ui` shadcn (Alert, Accordion)

## Non-negotiable conventions

- **UI:** shadcn components in `packages/ui`, imported as `@shedflow/ui/components`. No MUI/Chakra/antd.
- **API:** Nest modules = entity + abstract `Repository` + `Prisma*Repository` + service + controller. Tenant finds always take `organizationId`.
- **Time:** UTC `timestamptz` in DB; IANA zones in rules/UI; `date-fns` + `@date-fns/tz`.
- **Money:** integer minor units + ISO currency.
- **Cards:** Stripe Checkout/Connect only; never store PAN.
- **Side effects:** write `domain_events` in the same DB transaction; worker sends email/calendar/webhooks.
- **Auth paths:** keep `/auth/login` and `/auth/register` stable for NextAuth.

## Commands

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres   # host port 5434
pnpm db:migrate
pnpm dev
pnpm --filter @shedflow/api test
pnpm --filter @shedflow/api test:e2e
```

Node ≥ 22.13. After T-001, `db:*` scripts live on `@shedflow/db`.

## When finishing a task

Update the task’s **Status** line to `DONE`. Do not mark DONE if listed tests fail.
