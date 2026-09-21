import { createHmac, timingSafeEqual } from 'node:crypto';

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `v1=${mac}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: number;
  rawBody: string;
  signatureHeader: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
}): boolean {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxSkew = input.maxSkewSeconds ?? 300;
  if (Math.abs(now - input.timestamp) > maxSkew) {
    return false;
  }
  const expected = signWebhookPayload(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signatureHeader);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Retry delays: 1m, 5m, 25m, 2h, 8h, 24h (attempt is 1-indexed after failure). */
export const WEBHOOK_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  25 * 60_000,
  2 * 60 * 60_000,
  8 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

export function webhookRetryDelayMs(attempt: number): number | null {
  if (attempt < 1 || attempt > WEBHOOK_RETRY_DELAYS_MS.length) {
    return null;
  }
  return WEBHOOK_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export const API_KEY_SCOPES = [
  'bookings:read',
  'bookings:write',
  'event_types:read',
  'event_types:write',
  'customers:read',
  'webhooks:write',
  'availability:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
