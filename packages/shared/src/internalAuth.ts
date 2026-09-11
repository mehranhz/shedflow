import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_TIMESTAMP_HEADER = 'X-Internal-Timestamp';
export const INTERNAL_SIGNATURE_HEADER = 'X-Internal-Signature';
export const INTERNAL_MAX_SKEW_SECONDS = 30;

export function internalCanonicalString(
  timestamp: string,
  method: string,
  path: string,
  body = '',
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

export function signInternalRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body?: string;
}): string {
  return createHmac('sha256', input.secret)
    .update(
      internalCanonicalString(
        input.timestamp,
        input.method,
        input.path,
        input.body ?? '',
      ),
    )
    .digest('hex');
}

export function internalTimestamp(now = new Date()): string {
  return String(Math.floor(now.getTime() / 1000));
}

function timestampToMs(timestamp: string): number | null {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return null;
  }
  // Unix seconds are < 1e12; epoch milliseconds are ~1e12+.
  return ts < 1e12 ? ts * 1000 : ts;
}

export function verifyInternalRequest(input: {
  secret: string;
  timestamp: string;
  signature: string;
  method: string;
  path: string;
  body?: string;
  now?: Date;
  maxSkewSeconds?: number;
}): boolean {
  const skew = input.maxSkewSeconds ?? INTERNAL_MAX_SKEW_SECONDS;
  const tsMs = timestampToMs(input.timestamp);
  if (tsMs === null) {
    return false;
  }

  const nowMs = (input.now ?? new Date()).getTime();
  if (Math.abs(nowMs - tsMs) > skew * 1000) {
    return false;
  }

  const expected = signInternalRequest({
    secret: input.secret,
    timestamp: input.timestamp,
    method: input.method,
    path: input.path,
    body: input.body,
  });

  try {
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(input.signature, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
