import {
  EntityNotFoundError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
} from '../common/persistence';
import { Prisma } from '../generated/prisma/client';

const UNIQUE_CONSTRAINT = 'P2002';
const FOREIGN_KEY_CONSTRAINT = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

// P2002 reports the columns under `target`, P2003 under `field_name`.
function conflictingFields(
  meta: Record<string, unknown> | undefined,
): string[] {
  const reported = meta?.target ?? meta?.field_name;

  if (Array.isArray(reported)) {
    return reported.filter(
      (field): field is string => typeof field === 'string',
    );
  }
  return typeof reported === 'string' ? [reported] : [];
}

/**
 * Single place where Prisma failures become the ORM-agnostic errors from
 * `common/persistence`. Anything unrecognised is passed through untouched.
 */
export function toRepositoryError(error: unknown, entityName: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case UNIQUE_CONSTRAINT:
        return new UniqueConstraintError(
          entityName,
          conflictingFields(error.meta),
        );
      case FOREIGN_KEY_CONSTRAINT:
        return new ForeignKeyConstraintError(
          entityName,
          conflictingFields(error.meta),
        );
      case RECORD_NOT_FOUND:
        return new EntityNotFoundError(entityName);
    }
  }

  return error instanceof Error ? error : new Error(String(error));
}
