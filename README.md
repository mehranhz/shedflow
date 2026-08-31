<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
$ cp .env.example .env
```

## Database

The app persists data in PostgreSQL through [Prisma](https://www.prisma.io). Start a
local database and apply the schema:

```bash
# starts Postgres on localhost:5432 with a `shedflow` and a `shedflow_test` database
$ docker compose up -d

# creates/applies migrations and regenerates Prisma Client
$ pnpm db:migrate
```

Other database commands:

```bash
$ pnpm db:generate       # regenerate Prisma Client into src/generated/prisma
$ pnpm db:migrate:deploy  # apply pending migrations (use this in production)
$ pnpm db:reset           # drop and recreate the database from migrations
$ pnpm db:studio          # browse the data in Prisma Studio
```

Prisma Client is generated code and is not committed. It is rebuilt automatically on
`pnpm install`, so run `pnpm db:generate` after editing `prisma/schema.prisma`.

## Persistence architecture

Services depend on repository contracts, never on an ORM. There are two layers:

| Layer | Location | Knows about Prisma? |
| --- | --- | --- |
| Contracts | `src/common/persistence/` | No |
| Prisma adapters | `src/prisma/` | Yes |
| Feature modules | `src/<module>/` | Only in `prisma-<entity>.repository.ts` |

`src/common/persistence/` is the ORM-agnostic core, reused by every module:

- `Repository<TEntity, TCreateData, TUpdateData, TId>` — generic CRUD contract
  (`create`, `findById`, `findAll`, `update`, `delete`, `exists`, `count`).
- `Page` / `PageRequest` / `Sort` — pagination and sorting, with limits clamped
  centrally so no implementation can be asked for an unbounded page.
- `RepositoryError` and friends (`EntityNotFoundError`, `UniqueConstraintError`,
  `ForeignKeyConstraintError`) — the only failures a repository may throw, so
  services never branch on driver error codes.
- `TransactionManager` — commit across several repositories atomically without
  knowing who provides the transaction.
- `InMemoryRepository` — a complete implementation for unit tests and prototyping.

`src/prisma/` implements those contracts once:

- `PrismaRepository` — the whole `Repository` surface on top of Prisma, including
  pagination, error translation, and transaction awareness.
- `PrismaTransactionManager` — `TransactionManager` backed by `$transaction`.
  `PrismaService` carries the transaction client in an `AsyncLocalStorage`, so
  repositories used inside `runInTransaction` join it automatically and nothing
  has to be threaded through method signatures.

### Adding a module

Define the entity and its create/update payloads, extend the generic contract
with only the queries that are specific to the module, then implement it:

```ts
// orders/order.repository.ts
export abstract class OrderRepository extends Repository<
  Order,
  CreateOrderData,
  UpdateOrderData
> {
  abstract findByCustomerId(customerId: string): Promise<Order[]>;
}

// orders/prisma-order.repository.ts
@Injectable()
export class PrismaOrderRepository
  extends PrismaRepository<OrderRecord, Order, CreateOrderData, UpdateOrderData>
  implements OrderRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'Order');
  }

  protected delegate(client: Prisma.TransactionClient) {
    return client.order;
  }

  protected toEntity(record: OrderRecord): Order {
    /* explicit field mapping */
  }

  findByCustomerId(customerId: string): Promise<Order[]> {
    return this.findManyWhere({ customerId });
  }
}
```

Then bind the contract to the implementation in the module:

```ts
providers: [
  OrdersService,
  { provide: OrderRepository, useClass: PrismaOrderRepository },
],
```

Filtering beyond identity lookups is declared as an explicit method
(`findByCustomerId`) rather than a generic query language. That is deliberate: a
half-generic `where` object would leak Prisma's operators and quietly become
impossible to reimplement on another ORM. Use the protected `findOneWhere` /
`findManyWhere` helpers to keep those methods to a single line.

### Swapping the ORM or database

Write a class implementing the module's contract and rebind it — the service
layer, guards and strategies are untouched:

```ts
{ provide: UserRepository, useClass: TypeOrmUserRepository }
```

The contract semantics are pinned by
`src/common/persistence/in-memory.repository.spec.ts`, which is the suite a new
implementation should be checked against.

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests (needs a running database; migrates and truncates TEST_DATABASE_URL)
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
