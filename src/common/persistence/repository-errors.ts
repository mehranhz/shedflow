/**
 * Storage failures every implementation must express in the same way. Services
 * catch these instead of driver-specific error codes, which is what keeps them
 * independent of the ORM.
 */
export abstract class RepositoryError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// Ids are usually strings, but composite keys are objects.
function formatId(id: unknown): string {
  switch (typeof id) {
    case 'string':
      return id;
    case 'number':
    case 'bigint':
    case 'boolean':
      return id.toString();
    default:
      return JSON.stringify(id) ?? 'unknown';
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(
    readonly entityName: string,
    readonly id?: unknown,
  ) {
    super(
      id === undefined
        ? `${entityName} was not found`
        : `${entityName} with id "${formatId(id)}" was not found`,
    );
  }
}

export class UniqueConstraintError extends RepositoryError {
  constructor(
    readonly entityName: string,
    /** Entity fields that collided, when the driver reports them. */
    readonly fields: string[] = [],
  ) {
    super(
      fields.length > 0
        ? `${entityName} with the same ${fields.join(', ')} already exists`
        : `${entityName} violates a uniqueness constraint`,
    );
  }
}

export class ForeignKeyConstraintError extends RepositoryError {
  constructor(
    readonly entityName: string,
    readonly fields: string[] = [],
  ) {
    super(
      fields.length > 0
        ? `${entityName} references a missing record through ${fields.join(', ')}`
        : `${entityName} references a missing record`,
    );
  }
}
