import { RequestContextValue } from './request-context';

export const REQUEST_CONTEXT_KEY = 'shedflowRequestContext';

export function attachRequestContext(
  request: object,
  value: RequestContextValue,
): void {
  (request as Record<string, unknown>)[REQUEST_CONTEXT_KEY] = value;
}

export function readRequestContext(
  request: object,
): RequestContextValue | undefined {
  return (request as Record<string, unknown>)[REQUEST_CONTEXT_KEY] as
    | RequestContextValue
    | undefined;
}
