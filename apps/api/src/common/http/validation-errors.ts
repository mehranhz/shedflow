import { ValidationError } from 'class-validator';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      fieldErrors[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(fieldErrors, flattenValidationErrors(error.children, path));
    }
  }

  return fieldErrors;
}
