import { randomUUID } from 'node:crypto';
import { Page, PageRequest, Sort, buildPage, resolvePageRequest } from './page';
import { Repository } from './repository';
import {
  EntityNotFoundError,
  UniqueConstraintError,
} from './repository-errors';

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right);
  }
  // Field types a database could not meaningfully order either; keep insertion order.
  return 0;
}

/**
 * Complete in-memory implementation of {@link Repository}, for unit tests and
 * prototyping. Subclasses only supply how a create payload becomes an entity,
 * which keeps a test double for a new module down to a handful of lines and
 * proves the contract is satisfiable without a database.
 */
export abstract class InMemoryRepository<
  TEntity extends { id: string },
  TCreateData,
  TUpdateData = Partial<TCreateData>,
> extends Repository<TEntity, TCreateData, TUpdateData, string> {
  protected readonly rows = new Map<string, TEntity>();

  protected constructor(
    protected readonly entityName: string,
    /** Fields the real schema has a unique index on, so conflicts behave alike. */
    private readonly uniqueFields: Extract<keyof TEntity, string>[] = [],
  ) {
    super();
  }

  /** Mirrors the database defaults (generated id, timestamps, ...). */
  protected abstract buildEntity(id: string, data: TCreateData): TEntity;

  create(data: TCreateData): Promise<TEntity> {
    const entity = this.buildEntity(randomUUID(), data);
    const conflict = this.findConflict(entity);
    if (conflict) {
      return Promise.reject(
        new UniqueConstraintError(this.entityName, [conflict]),
      );
    }

    this.rows.set(entity.id, entity);
    return Promise.resolve(entity);
  }

  findById(id: string): Promise<TEntity | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findAll(request: PageRequest<TEntity> = {}): Promise<Page<TEntity>> {
    const { page, limit, skip, sort } = resolvePageRequest(request);
    const all = this.sortRows([...this.rows.values()], sort);

    return Promise.resolve(
      buildPage(all.slice(skip, skip + limit), all.length, page, limit),
    );
  }

  update(id: string, data: TUpdateData): Promise<TEntity> {
    const existing = this.rows.get(id);
    if (!existing) {
      return Promise.reject(new EntityNotFoundError(this.entityName, id));
    }

    const updated = { ...existing, ...(data as object) };
    const conflict = this.findConflict(updated);
    if (conflict) {
      return Promise.reject(
        new UniqueConstraintError(this.entityName, [conflict]),
      );
    }

    this.rows.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: string): Promise<void> {
    if (!this.rows.delete(id)) {
      return Promise.reject(new EntityNotFoundError(this.entityName, id));
    }
    return Promise.resolve();
  }

  exists(id: string): Promise<boolean> {
    return Promise.resolve(this.rows.has(id));
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  /** Building block for the module-specific finders declared on subclasses. */
  protected findOneWhere(
    predicate: (entity: TEntity) => boolean,
  ): Promise<TEntity | null> {
    return Promise.resolve([...this.rows.values()].find(predicate) ?? null);
  }

  private findConflict(candidate: TEntity): string | null {
    for (const field of this.uniqueFields) {
      const clash = [...this.rows.values()].some(
        (row) => row.id !== candidate.id && row[field] === candidate[field],
      );
      if (clash) {
        return field;
      }
    }
    return null;
  }

  private sortRows(rows: TEntity[], sort: Sort<TEntity>[]): TEntity[] {
    if (sort.length === 0) {
      return rows;
    }

    return [...rows].sort((left, right) => {
      for (const { field, direction } of sort) {
        const order = compareValues(left[field], right[field]);
        if (order !== 0) {
          return direction === 'asc' ? order : -order;
        }
      }
      return 0;
    });
  }
}
