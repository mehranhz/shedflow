import {
  Page,
  PageRequest,
  Repository,
  Sort,
  buildPage,
  resolvePageRequest,
} from '../common/persistence';
import { Prisma } from '../generated/prisma/client';
import { toRepositoryError } from './prisma-error';
import { PrismaService } from './prisma.service';

/** The slice of a generated Prisma model delegate that this base relies on. */
export type PrismaModelDelegate<TRecord> = {
  create(args: { data: any }): Promise<TRecord>;
  findUnique(args: { where: any }): Promise<TRecord | null>;
  findFirst(args: { where: any }): Promise<TRecord | null>;
  findMany(args?: any): Promise<TRecord[]>;
  update(args: { where: any; data: any }): Promise<TRecord>;
  delete(args: { where: any }): Promise<TRecord>;
  count(args?: any): Promise<number>;
};

/**
 * Implements the whole {@link Repository} contract on top of Prisma, so a module
 * repository only declares which delegate to use, how a row becomes an entity,
 * and its own domain-specific finders.
 *
 * Every query goes through {@link run}, which converts Prisma errors into the
 * shared repository errors, and reads the delegate from
 * {@link PrismaService.activeClient} so it automatically participates in an
 * ambient transaction.
 */
export abstract class PrismaRepository<
  TRecord,
  TEntity,
  TCreateData,
  TUpdateData = Partial<TCreateData>,
  TId = string,
> extends Repository<TEntity, TCreateData, TUpdateData, TId> {
  protected constructor(
    private readonly prisma: PrismaService,
    protected readonly entityName: string,
  ) {
    super();
  }

  protected abstract delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<TRecord>;

  /** Explicit row-to-entity mapping keeps schema changes from leaking outwards. */
  protected abstract toEntity(record: TRecord): TEntity;

  protected get model(): PrismaModelDelegate<TRecord> {
    return this.delegate(this.prisma.activeClient());
  }

  protected toCreateInput(data: TCreateData): object {
    return data as object;
  }

  protected toUpdateInput(data: TUpdateData): object {
    return data as object;
  }

  /** Override for composite or non-`id` primary keys. */
  protected whereId(id: TId): object {
    return { id };
  }

  protected orderBy(sort: Sort<TEntity>[]): object[] {
    return sort.map(({ field, direction }) => ({ [field]: direction }));
  }

  protected async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toRepositoryError(error, this.entityName);
    }
  }

  /** Building blocks for the module-specific finders declared on subclasses. */
  protected findOneWhere(where: object): Promise<TEntity | null> {
    return this.run(async () => {
      const record = await this.model.findFirst({ where });
      return record ? this.toEntity(record) : null;
    });
  }

  protected findManyWhere(where: object): Promise<TEntity[]> {
    return this.run(async () => {
      const records = await this.model.findMany({ where });
      return records.map((record) => this.toEntity(record));
    });
  }

  create(data: TCreateData): Promise<TEntity> {
    return this.run(async () =>
      this.toEntity(
        await this.model.create({ data: this.toCreateInput(data) }),
      ),
    );
  }

  findById(id: TId): Promise<TEntity | null> {
    return this.run(async () => {
      const record = await this.model.findUnique({ where: this.whereId(id) });
      return record ? this.toEntity(record) : null;
    });
  }

  findAll(request: PageRequest<TEntity> = {}): Promise<Page<TEntity>> {
    const { page, limit, skip, sort } = resolvePageRequest(request);

    return this.run(async () => {
      const [records, total] = await Promise.all([
        this.model.findMany({
          skip,
          take: limit,
          ...(sort.length > 0 ? { orderBy: this.orderBy(sort) } : {}),
        }),
        this.model.count(),
      ]);

      return buildPage(
        records.map((record) => this.toEntity(record)),
        total,
        page,
        limit,
      );
    });
  }

  update(id: TId, data: TUpdateData): Promise<TEntity> {
    return this.run(async () =>
      this.toEntity(
        await this.model.update({
          where: this.whereId(id),
          data: this.toUpdateInput(data),
        }),
      ),
    );
  }

  async delete(id: TId): Promise<void> {
    await this.run(() => this.model.delete({ where: this.whereId(id) }));
  }

  async exists(id: TId): Promise<boolean> {
    const matches = await this.run(() =>
      this.model.count({ where: this.whereId(id) }),
    );
    return matches > 0;
  }

  count(): Promise<number> {
    return this.run(() => this.model.count());
  }
}
