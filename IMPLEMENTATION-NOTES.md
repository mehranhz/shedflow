# Implementation notes (scratch doc — safe to delete)

A walkthrough of everything that changed in this session, why each decision was
made, and what to watch out for. Written for you, not for the repo.

---

## 1. Where the project started

Before any of this, `shedflow` was a minimal NestJS 11 scaffold:

- Three modules: `AppModule` (root), `UsersModule`, `AuthModule`.
- Auth worked: bcrypt hashing, JWT access tokens, Passport local + JWT
strategies, a global `JwtAuthGuard` with a `@Public()` opt-out.
- **No database at all.** `UsersService` stored users in a
`private readonly users = new Map<string, User>()`. Restart the process and
every account was gone.
- `User` was a hand-written TypeScript type, not an ORM entity.
- Env handling was `@nestjs/config` with `JWT_SECRET` (required) and `PORT`.
- Tests: one trivial controller spec, one auth service spec, one e2e spec — all
relying on the in-memory map.

There were no roles, no migrations, no Docker, no `.env.example`.

Three things happened, in order:

1. **Prisma + PostgreSQL** replaced the in-memory map.
2. **A repository layer** was put in front of Prisma (users only — this was too
  narrow, and you correctly called it out).
3. **The repository layer was generalised** into a shared, reusable persistence
  core that every future module extends.

---



## 2. Phase 1 — Prisma and PostgreSQL



### 2.1 Why Prisma 7, and why it looks unusual

`npm view prisma dist-tags` showed `latest` pointing at `8.0.0-rc.12` — a
release candidate. The last stable was `7.10.0`, so both `prisma` and
`@prisma/client` are pinned to exactly `7.10.0` (no caret) because Prisma
requires the CLI and client versions to match.

Prisma 7 changed three things that make this setup look different from older
tutorials:


| Change                                                           | Consequence here                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The Rust query engine is gone; a **driver adapter is mandatory** | We install `@prisma/adapter-pg` + `pg` and pass an adapter to `new PrismaClient({ adapter })` |
| Client is **no longer generated into** `node_modules`            | `output` is required in the generator block → `src/generated/prisma`                          |
| Database URL **moved out of** `schema.prisma`                    | It now lives in `prisma.config.ts` at the project root                                        |




### 2.2 `prisma/schema.prisma`

```prisma
generator client {
  provider     = "prisma-client"       // not the legacy "prisma-client-js"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"                 // Prisma 7 emits ESM by default; Nest is CJS
}

datasource db {
  provider = "postgresql"              // note: no `url` — that's in prisma.config.ts
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("users")
}
```

Decisions in there:

- `@map` / `@@map` keep **snake_case in the database** while the TypeScript side
stays camelCase. This matters if anyone ever queries the DB directly or you
move to another ORM with different naming conventions.
- `@db.Uuid` stores a real Postgres `UUID` type, not a `TEXT` column.
- `@db.Timestamptz(3)` is timezone-aware. Plain `DateTime` maps to
`timestamp(3)` **without** a timezone, which is a classic production bug.
- `updatedAt` is new (your original type didn't have it). It's excluded from API
responses — see §2.6.
- `email` uniqueness is enforced by the **database**, not just app code. Before
this, two simultaneous registrations could both pass the "does this email
exist?" check.



### 2.3 `prisma.config.ts`

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
```

Two subtle points:

- `process.env` **instead of Prisma's** `env()` **helper.** Prisma's `env()` throws
if the variable is missing. Every CLI command loads this file, including
`prisma generate`, which doesn't need a database. With `env()`, a CI job that
only type-checks would crash with
`PrismaConfigEnvError: Missing required environment variable: DATABASE_URL`.
- `shadowDatabaseUrl` **is optional.** Prisma needs a scratch database to
compute migration diffs. Normally it creates one automatically, but many
hosted Postgres providers don't let the app user create databases. This gives
you an escape hatch without editing code.

`prisma.config.ts` is also **excluded from** `tsconfig.build.json`. Without that,
TypeScript's inferred root directory shifts from `src/` to the project root, and
the build starts emitting `dist/src/main.js` instead of `dist/main.js` — which
silently breaks `pnpm start:prod` (`node dist/main`).

### 2.4 The migration

`prisma/migrations/20260831074219_init/migration.sql`:

```sql
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
```

This is committed to git. `migration_lock.toml` records `provider = "postgresql"`
so Prisma refuses to apply these migrations against a different engine.

### 2.5 `PrismaService`

`src/prisma/prisma.service.ts` extends `PrismaClient` and hooks into Nest's
lifecycle. `main.ts` gained `app.enableShutdownHooks()` so `onModuleDestroy`
actually fires on SIGTERM and connections close cleanly.

It also owns the transaction plumbing, covered in §4.4.

- 2.6 The API shape did not change

`PublicUser` is defined with `Pick`, not `Omit`:

```ts
export type PublicUser = Pick<User, 'id' | 'email' | 'createdAt'>;
```

`Omit<User, 'passwordHash'>` would have automatically leaked `updatedAt` — and
every future column — into API responses. `Pick` fails closed instead: new fields
are private until you explicitly expose them.

### 2.7 Local infrastructure

- `docker-compose.yml` — Postgres 16 on `localhost:5432`, healthcheck, named
volume for persistence.
- `docker/postgres/init-test-db.sql` — creates a second database,
`shedflow_test`, on first boot so e2e tests never touch dev data.
- `.env.example` — documents `JWT_SECRET`, `PORT`, `DATABASE_URL`,
`TEST_DATABASE_URL`, and the optional `SHADOW_DATABASE_URL`.
- Your `.env` was updated in place; `JWT_SECRET` and `PORT` kept their values.



### 2.8 Scripts added to `package.json`

```
postinstall        prisma generate      (client is gitignored, so regenerate on install)
db:generate        prisma generate
db:migrate         prisma migrate dev   (create + apply a migration in dev)
db:migrate:deploy  prisma migrate deploy (apply only — use in production)
db:reset           prisma migrate reset
db:studio          prisma studio
```

---



## 3. Environment problems I hit (worth knowing about)

These weren't code issues; they were toolchain friction. Documented because
you'll hit them again.

1. **pnpm needs Node ≥ 22.13, your default is 22.11.** `pnpm` refused to run at
  all. I ran everything with the `24.16.0` you already have in nvm. Long term:
   `nvm alias default 24.16.0`, or add an `.nvmrc`.
2. `node_modules` **had to be recreated.** pnpm rejected the existing directory
  with `ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF` — it had been created with
   different settings. A full reinstall fixed it (slow, the registry was
   crawling at times).
3. **pnpm blocks dependency build scripts by default.** Installs exited `1` with
  `ERR_PNPM_IGNORED_BUILDS`. In pnpm 11 the allowlist is `allowBuilds` **in**
   `pnpm-workspace.yaml`, not `onlyBuiltDependencies` in `package.json` (I
   tried that first; it's silently ignored). New file:
4. **Jest couldn't resolve the generated client.** Prisma's output uses ESM-style
  `./internal/class.js` specifiers that resolve to `.ts` files. Both Jest configs
   got the standard mapper:
5. **Prisma 7's WASM query compiler uses dynamic** `import()`**.** Jest's CJS runtime
  rejects that with
   `A dynamic import callback was invoked without --experimental-vm-modules`. So
   `test:e2e` runs Jest through `node` directly with the flag (portable, no
   `cross-env` dependency):
   Unit tests don't need it because they never instantiate a real client.
6. **No usable Postgres on this machine.** Docker's daemon wasn't running and
  only the Postgres *client* was installed, no server. For verification I used
   `prisma dev` (Prisma's embedded PGlite-backed Postgres 17) and removed it
   afterwards. Your `docker compose up -d` path is untested on this machine but
   standard.

---



## 4. Phases 2 and 3 — the repository layer



### 4.1 What was wrong with the first attempt

My first pass created a single `UserRepository` + `PrismaUserRepository`. That
decoupled the users module, but it was a **one-off**: every new module would
have reimplemented CRUD, pagination, and error translation by hand, and they'd
all have drifted. Your objection was right. The second pass split it into a
generic core plus a thin per-module layer.

### 4.2 Layer map


| Layer             | Location                  | Knows about Prisma?                 |
| ----------------- | ------------------------- | ----------------------------------- |
| Contracts (ports) | `src/common/persistence/` | **No**                              |
| Prisma adapters   | `src/prisma/`             | Yes                                 |
| Feature modules   | `src/users/`              | Only in `prisma-user.repository.ts` |


Grep proof — after the refactor, the only files importing `src/generated/prisma`
are `src/prisma/prisma.service.ts`, `src/prisma/prisma.repository.ts`,
`src/prisma/prisma-error.ts`, and `src/users/prisma-user.repository.ts`. No
service, guard, strategy, or controller touches it.

### 4.3 The ORM-agnostic core (`src/common/persistence/`)


| File                      | What it holds                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `repository.ts`           | `Repository<TEntity, TCreateData, TUpdateData, TId>` — `create`, `findById`, `findAll`, `update`, `delete`, `exists`, `count` |
| `page.ts`                 | `Page`, `PageRequest`, `Sort`, plus `resolvePageRequest` / `buildPage` helpers                                                |
| `repository-errors.ts`    | `RepositoryError` base + `EntityNotFoundError`, `UniqueConstraintError`, `ForeignKeyConstraintError`                          |
| `transaction-manager.ts`  | `TransactionManager` — `runInTransaction(work)`                                                                               |
| `in-memory.repository.ts` | A full working implementation, for tests and prototyping                                                                      |
| `index.ts`                | Barrel so consumers import from one path                                                                                      |


Design decisions worth understanding:

**Abstract classes, not interfaces.** TypeScript interfaces vanish at runtime, so
they can't be DI tokens — you'd need `@Inject('USER_REPOSITORY')` string
constants everywhere. An abstract class is both a compile-time contract *and* a
runtime token, so `constructor(private readonly users: UserRepository)` just
works and stays type-safe.

**Pagination is clamped centrally.** `resolvePageRequest` forces 1-based pages
and caps `limit` at `MAX_PAGE_LIMIT` (100). No implementation can be tricked
into `?limit=1000000`.

**Errors are part of the contract.** Implementations may *only* throw the errors
in `repository-errors.ts`. This is the thing that actually decouples services:
`UsersService` catches `UniqueConstraintError`, never Prisma's `P2002`.

**No generic** `where` **/ criteria object.** This was deliberate and is the most
debatable call, so here's the reasoning: a half-generic filter object inevitably
starts leaking Prisma's operator shapes (`{ contains }`, `{ in }`, `{ mode: 'insensitive' }`, relation filters). Once services pass those around, the
"swappable" contract is a lie because no other ORM accepts them. Instead, domain
queries are **explicit named methods** (`findByEmail`, `findByCustomerId`), each
one line thanks to the protected `findOneWhere` / `findManyWhere` helpers. The
cost is one method per query; the benefit is that the contract is honestly
implementable by anything.

### 4.4 The Prisma implementation (`src/prisma/`)


| File                            | Role                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `prisma.service.ts`             | `PrismaClient` + lifecycle + transaction context                 |
| `prisma.repository.ts`          | `PrismaRepository` — implements the entire `Repository` contract |
| `prisma-error.ts`               | `toRepositoryError()` — the only place Prisma error codes appear |
| `prisma-transaction.manager.ts` | `TransactionManager` via `$transaction`                          |
| `prisma.module.ts`              | `@Global()` module providing both                                |


`PrismaRepository` is where the reuse lives. Subclasses provide only:

- `delegate(client)` → which Prisma model to use (`client.user`)
- `toEntity(record)` → explicit field-by-field row → entity mapping

and optionally override `toCreateInput`, `toUpdateInput`, `whereId` (for
composite keys), or `orderBy`.

Every query goes through `run()`, which wraps the call in try/catch and passes
failures through `toRepositoryError`. And the delegate is read lazily from
`this.prisma.activeClient()` on **every** call — that's what makes transactions
work transparently.

`PrismaModelDelegate<TRecord>` is a structural type describing the handful of
methods the base needs (`create`, `findUnique`, `findFirst`, `findMany`,
`update`, `delete`, `count`). Prisma's real generated delegates satisfy it
structurally, which is how one generic base can drive any model without Prisma's
enormous per-model generic types bleeding through.

**Transactions via** `AsyncLocalStorage` — the trickiest part:

```ts
private readonly transaction = new AsyncLocalStorage<Prisma.TransactionClient>();

activeClient(): Prisma.TransactionClient {
  return this.transaction.getStore() ?? this;
}

runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (this.transaction.getStore()) return work();          // join the outer one
  return this.$transaction((tx) => this.transaction.run(tx, work));
}
```

Why this matters: Prisma's `$transaction(tx => ...)` hands you a *different*
client object. The naive approach is to pass `tx` into every repository method,
which pollutes every signature up the call stack. `AsyncLocalStorage` carries it
implicitly, so `orders.create()` inside `runInTransaction` automatically uses the
transaction client. The `if` guard makes nesting safe — a nested call joins the
outer transaction instead of opening a second one and deadlocking.

This is verified by a real e2e test (§5), because untested transaction plumbing
is exactly the kind of thing that silently doesn't roll back.

`PrismaModule` **is** `@Global()` and imported once in `AppModule`, so feature
modules don't each repeat `imports: [PrismaModule]`. The tradeoff is slightly
less explicit wiring; the alternative is boilerplate in every module.

### 4.5 What a module costs now

`src/users/` is the reference implementation. Five files:

- `user.ts` — the domain entity, **hand-written**. This is important: it used
to be `export type { User } from '../generated/prisma/client'`, which meant the
Prisma type propagated everywhere and the abstraction was cosmetic. Also holds
`PublicUser`, `CreateUserData`, `UpdateUserData`.
- `user.repository.ts` — the contract. Inherits all CRUD, adds one method:
  ```ts
  export abstract class UserRepository extends Repository<
    User, CreateUserData, UpdateUserData
  > {
    abstract findByEmail(email: string): Promise<User | null>;
  }
  ```
- `prisma-user.repository.ts` — the adapter. A constructor, `delegate()`,
`toEntity()`, and `findByEmail` as `return this.findOneWhere({ email })`.
- `users.service.ts` — depends only on `UserRepository`. Owns email
normalisation (lowercasing) so **every** implementation behaves identically,
and translates `UniqueConstraintError` → `ConflictException`.
- `users.module.ts` — binds the contract to the implementation:
  ```ts
  { provide: UserRepository, useClass: PrismaUserRepository }
  ```

Swapping ORMs = write a new class implementing `UserRepository`, change that one
line. Services, guards, strategies, controllers untouched.

---



## 5. Tests

**10 unit tests, 3 suites** (`pnpm test`, no database needed):

- `src/app.controller.spec.ts` — untouched.
- `src/common/persistence/in-memory.repository.spec.ts` — **new**. Pins the
contract semantics: 1-based pagination, limit clamping, descending sort, which
field collided on a unique violation, `EntityNotFoundError` on update/delete of
a missing id. This is the suite to run any new implementation against.
- `src/auth/auth.service.spec.ts` — now binds an `InMemoryUserRepository`
(9 lines, because `InMemoryRepository` does the work) instead of faking the
Prisma client. Faster, and it proves a second implementation drops in.

**4 e2e tests** (`pnpm test:e2e`, needs a database):

- `test/setup-e2e.ts` is a Jest `globalSetup` that points `DATABASE_URL` at
`TEST_DATABASE_URL` and runs `prisma migrate deploy`, so the command is
self-contained.
- Each test truncates `users` via `prisma.user.deleteMany()`.
- Covers: public `/`, register + 401 + `/auth/me`, login, and **transaction
rollback** (write through a repository inside `runInTransaction`, throw, assert
the row is gone).



### A deliberate inconsistency

`test/app.e2e-spec.ts` injects `PrismaService` directly for truncation. That's
the one place outside `src/prisma/` and the adapter that knows about Prisma. The
alternative was adding `deleteAll()` to the domain contract purely for testing,
which would pollute the production interface. An end-to-end test whose whole
purpose is exercising the real database knowing about the real database seemed
like the lesser evil. It's a one-line change if you switch ORMs.

---



## 6. Everything that changed, by file



### New

```
prisma/schema.prisma
prisma/migrations/20260831074219_init/migration.sql
prisma/migrations/migration_lock.toml
prisma.config.ts
pnpm-workspace.yaml                             pnpm allowBuilds allowlist
docker-compose.yml
docker/postgres/init-test-db.sql
.env.example
.prettierignore                                 skips generated client + migrations

src/common/persistence/index.ts
src/common/persistence/repository.ts
src/common/persistence/page.ts
src/common/persistence/repository-errors.ts
src/common/persistence/transaction-manager.ts
src/common/persistence/in-memory.repository.ts
src/common/persistence/in-memory.repository.spec.ts

src/prisma/prisma.module.ts
src/prisma/prisma.service.ts
src/prisma/prisma.repository.ts
src/prisma/prisma-error.ts
src/prisma/prisma-transaction.manager.ts

src/users/user.repository.ts
src/users/prisma-user.repository.ts

test/setup-e2e.ts
```



### Modified

```
package.json          prisma deps, db:* scripts, postinstall, jest mapper, test:e2e flag
pnpm-lock.yaml        regenerated
.gitignore            + /src/generated
eslint.config.mjs     ignores dist/** and src/generated/**
tsconfig.build.json   excludes prisma.config.ts (keeps dist/main.js flat)
README.md             database setup + persistence architecture sections
src/main.ts           + app.enableShutdownHooks()
src/app.module.ts     + PrismaModule
src/users/user.ts     hand-written entity + create/update payloads
src/users/users.service.ts   repository-backed, translates domain errors
src/users/users.module.ts    binds UserRepository -> PrismaUserRepository
src/auth/auth.service.spec.ts  in-memory repository
test/app.e2e-spec.ts           test DB targeting, truncation, rollback test
test/jest-e2e.json             globalSetup + moduleNameMapper
.env                           + DATABASE_URL, TEST_DATABASE_URL (existing values kept)
```



### Untouched

All of `src/auth/` except the spec — controller, service, module, DTOs, guards,
strategies, decorators. That's the point of the abstraction: adding a database
and two layers of indirection didn't require editing the auth logic.

`src/generated/prisma/` is generated and **gitignored**; `postinstall` recreates
it.

---



## 7. Commands

```bash
# first time
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate

# day to day
pnpm start:dev
pnpm db:generate            # after editing prisma/schema.prisma
pnpm db:migrate             # after editing the schema, to create a migration
pnpm db:studio              # browse data

# checks
pnpm lint
pnpm test                   # unit, no database
pnpm test:e2e               # migrates + truncates TEST_DATABASE_URL
```

Remember pnpm needs Node ≥ 22.13.

---



## 8. Things I deliberately did not do

- **No roles/permissions.** There was no RBAC before and you didn't ask for it.
It'd be a `role` enum on `User` plus a `RolesGuard`.
- **No** `createMany` **/** `updateMany` **/ soft deletes / optimistic locking** on the
base contract. Easy to add, but adding them speculatively means every
implementation must support them.
- **No criteria/specification DSL.** Reasoning in §4.3.
- **No caching or read replicas.**
- `updatedAt` **isn't exposed** through any endpoint. Add it to `PublicUser` and
`toPublic()` if you want it.
- **Domain errors → HTTP mapping happens in services.** A global exception filter
translating `RepositoryError` subclasses centrally would be cleaner once there
are several modules — right now `UsersService` does it inline.

---



## 9. Quick mental model

```
Controller
    ↓  DTOs, validation
Service            ← business rules, normalisation, domain-error → HTTP mapping
    ↓  depends on an abstract class (the port)
Repository         ← Repository<...> contract, no ORM anywhere
    ↓  bound in the module's providers
PrismaRepository   ← generic implementation, error translation, transaction-aware
    ↓
PrismaService      ← client + AsyncLocalStorage transaction context
    ↓
PostgreSQL
```

Swap the bottom three boxes, and the top two don't notice.