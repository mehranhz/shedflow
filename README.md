# SchedFlow

SaaS that combines Calendly-style scheduling with Stripe billing for small
businesses. Turborepo: NestJS APIs, Next.js client (NextAuth + shadcn), Prisma,
Postgres.

**Auth is already implemented** (`POST /auth/register`, `POST /auth/login`,
`GET /auth/me`, NextAuth credentials on the client). The rest of Phase 1 is
specified and ticketed.

| Doc | What |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | Rules for coding agents |
| [`docs/design/README.md`](./docs/design/README.md) | System design — MVP and full-scale |
| [`tasks/README.md`](./tasks/README.md) | Implementable MVP tasks **T-001–T-039** |
| [`docs/runbooks/README.md`](./docs/runbooks/README.md) | On-call |

Start implementation at **T-001** in `tasks/wave-0-foundations.md`. Dashboard and
booking UI use **shadcn only**, via `@shedflow/ui`.

## Project setup

```bash
pnpm install
cp .env.example .env
```

Requires **Node ≥ 22.13** and pnpm 11.

## Database

PostgreSQL via Prisma. Compose publishes Postgres on host **5434** (not 5432).

```bash
docker compose up -d postgres
pnpm db:migrate
```

Compose profiles: `core` (Postgres) and `observability` (Prometheus/Grafana/…).
`.env.example` sets `COMPOSE_PROFILES=core,observability` so `docker compose up -d`
starts both; `docker compose up -d postgres` is enough for app work.

```bash
pnpm db:generate         # regenerate Prisma Client
pnpm db:migrate:deploy   # apply pending migrations (production)
pnpm db:reset            # drop and recreate (local only)
pnpm db:studio
```

Prisma Client is generated and gitignored. The schema lives in
`packages/db` (`@shedflow/db`).

## Persistence architecture

Services depend on repository contracts, never on an ORM. Paths are under
`apps/api/src/`:

| Layer | Location | Knows about Prisma? |
| --- | --- | --- |
| Contracts | `common/persistence/` | No |
| Prisma adapters | `prisma/` | Yes |
| Feature modules | `<module>/` | Only in `prisma-<entity>.repository.ts` |

- `Repository<TEntity, TCreateData, TUpdateData, TId>` — CRUD.
- `Page` / `PageRequest` / `Sort` — pagination, `limit` capped at 100.
- `RepositoryError` subclasses — the only errors a repository may throw.
- `TransactionManager` + `AsyncLocalStorage` so repositories join an ambient transaction.
- `InMemoryRepository` for unit tests.

Tenant-owned tables must be queried with `organizationId` (see
`docs/design/mvp/02-data-model.md`). New modules follow the same port/adapter
pattern.

## Compile and run

```bash
pnpm dev          # turbo: api (3001) + client (3000); later billing 3002, worker 3003
pnpm build
pnpm lint
pnpm test         # unit
pnpm test:e2e     # needs TEST_DATABASE_URL
```

Grafana in compose currently binds **3000** and will move to **3300** in T-035
so it does not collide with Next.js.

## License

UNLICENSED (private).
