import {
  EntityNotFoundError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
} from '../common/persistence';
import { Prisma } from '@shedflow/db';

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
  if (isExclusionViolation(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

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

function isExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : '';
  const metaCode =
    'meta' in error &&
    error.meta &&
    typeof error.meta === 'object' &&
    'code' in error.meta &&
    typeof (error.meta as { code?: unknown }).code === 'string'
      ? (error.meta as { code: string }).code
      : '';
  return (
    code === '23P01' ||
    metaCode === '23P01' ||
    message.includes('bookings_host_occupied_excl') ||
    message.includes('exclusion constraint')
  );
}
