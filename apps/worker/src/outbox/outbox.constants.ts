export const OUTBOX_RELAY_QUEUE = 'outbox.relay';
export const PGBOSS_SCHEMA = 'pgboss';
export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_LEASE_MS = 30_000;
export const POISON_EVENT_TYPE = 'test.poison';

export function eventQueueName(type: string): string {
  return `event:${type}`;
}

export function outboxBackoffMs(attempts: number, baseMs: number): number {
  const safeAttempts = Math.max(attempts, 1);
  return Math.min(baseMs * 2 ** (safeAttempts - 1), 3_600_000);
}

export type ClaimedOutboxRow = {
  id: string;
  organizationId: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type OutboxAttemptResult =
  | { status: 'PROCESSED'; processedAt: Date; lastError: null }
  | {
      status: 'PENDING';
      attempts: number;
      availableAt: Date;
      lastError: string;
    }
  | {
      status: 'FAILED';
      attempts: number;
      lastError: string;
      processedAt: Date;
    };

export function nextOutboxAttempt(input: {
  attempts: number;
  error: string;
  now: Date;
  maxAttempts: number;
  backoffMs: number;
}): OutboxAttemptResult {
  const attempts = input.attempts + 1;
  if (attempts >= input.maxAttempts) {
    return {
      status: 'FAILED',
      attempts,
      lastError: input.error,
      processedAt: input.now,
    };
  }

  return {
    status: 'PENDING',
    attempts,
    availableAt: new Date(
      input.now.getTime() + outboxBackoffMs(attempts, input.backoffMs),
    ),
    lastError: input.error,
  };
}
