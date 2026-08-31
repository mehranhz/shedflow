import { Page, PageRequest } from './page';

/**
 * Persistence contract shared by every module. Declared as an abstract class so
 * that module-level repositories can extend it and Nest can use those
 * subclasses as injection tokens without string constants.
 *
 * Implementations must only ever throw the errors from `repository-errors.ts`,
 * never driver-specific ones. Anything beyond identity lookups (filtering by
 * business fields, joins, aggregates) belongs on the module's own repository as
 * an explicit method rather than a generic query language, so the contract
 * stays honest about what a different ORM has to support.
 */
export abstract class Repository<
  TEntity,
  TCreateData,
  TUpdateData = Partial<TCreateData>,
  TId = string,
> {
  /** @throws UniqueConstraintError, ForeignKeyConstraintError */
  abstract create(data: TCreateData): Promise<TEntity>;

  abstract findById(id: TId): Promise<TEntity | null>;

  abstract findAll(request?: PageRequest<TEntity>): Promise<Page<TEntity>>;

  /** @throws EntityNotFoundError, UniqueConstraintError */
  abstract update(id: TId, data: TUpdateData): Promise<TEntity>;

  /** @throws EntityNotFoundError */
  abstract delete(id: TId): Promise<void>;

  abstract exists(id: TId): Promise<boolean>;

  abstract count(): Promise<number>;
}
