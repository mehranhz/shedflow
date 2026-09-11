# `@shedflow/db`

Shared Prisma schema, migrations, and generated client for `apps/api` (later
`apps/billing` and `apps/worker`).

## Local setup

Compose publishes Postgres on host **5434**. From the repo root:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
```

`pnpm db:*` scripts are defined here and invoked from the root `package.json`.

| Script | Command |
| --- | --- |
| `pnpm db:generate` | `prisma generate` + compile the client |
| `pnpm db:migrate` | `prisma migrate dev` (create + apply) |
| `pnpm db:migrate:deploy` | `prisma migrate deploy` (apply only) |
| `pnpm db:reset` | drop and recreate (local only) |
| `pnpm db:studio` | Prisma Studio |

`DATABASE_URL` is the pooled client URL. Migrations use `DIRECT_DATABASE_URL`
when set, otherwise they fall back to `DATABASE_URL`. Locally they are the same.

Generated client output (`src/generated/prisma`) is gitignored. `postinstall`
and `pnpm db:generate` recreate it.

## Adding a Prisma migration

1. Edit `prisma/schema.prisma`.
2. From the repo root: `pnpm db:migrate` (Prisma will ask for a name).
3. Prefer names `YYYYMMDDHHMMSS_<task_id>_<slug>` when creating migrations by
   hand.

## Raw SQL Prisma must not reverse

Prisma cannot express exclusion constraints, generated range columns, or some
check constraints. Put those in a **SQL-only** migration after the Prisma
migration that created the table:

1. Create a folder `prisma/migrations/<timestamp>_<slug>/migration.sql`.
2. Put `-- prisma-ignore` at the top of the file so later `prisma migrate diff`
   / `db pull` cycles are not treated as something to reverse.
3. Apply with `pnpm db:migrate:deploy` (or `pnpm db:migrate` locally).

Example (booking overlap, added in T-014):

```sql
-- prisma-ignore
-- GiST exclusion: one confirmed/pending booking per host per overlapping range.
-- Do not recreate this from `prisma db pull`; it is not representable in schema.prisma.
```

Never run `prisma migrate reset` in production.
