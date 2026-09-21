import { BadRequestException, ValidationError } from '@nestjs/common';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }
    if (error.children && error.children.length > 0) {
      Object.assign(result, flattenValidationErrors(error.children, path));
    }
  }

  return result;
}

export function createValidationException(errors: ValidationError[]) {
  return new BadRequestException({
    fieldErrors: flattenValidationErrors(errors),
  });
}
