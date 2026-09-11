export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_TIMEZONE',
  'INVALID_QUESTION_ANSWER',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_API_KEY',
  'FORBIDDEN',
  'FEATURE_GATED',
  'EMAIL_NOT_VERIFIED',
  'NOT_FOUND',
  'CONFLICT',
  'SLOT_UNAVAILABLE',
  'IDEMPOTENCY_MISMATCH',
  'EMAIL_TAKEN',
  'SLUG_TAKEN',
  'PAYMENT_REQUIRED',
  'CONNECT_INCOMPLETE',
  'INSUFFICIENT_CREDITS',
  'OUTSIDE_POLICY',
  'RATE_LIMITED',
  'INTERNAL',
  'UPSTREAM_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
