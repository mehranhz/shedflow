import { nextOutboxAttempt, outboxBackoffMs } from './outbox.constants';

describe('outbox backoff', () => {
  it('marks FAILED at max attempts', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const result = nextOutboxAttempt({
      attempts: 9,
      error: 'poison payload',
      now,
      maxAttempts: 10,
      backoffMs: 1000,
    });
    expect(result).toEqual({
      status: 'FAILED',
      attempts: 10,
      lastError: 'poison payload',
      processedAt: now,
    });
  });

  it('keeps PENDING with exponential backoff before the cap', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    const result = nextOutboxAttempt({
      attempts: 2,
      error: 'boom',
      now,
      maxAttempts: 10,
      backoffMs: 1000,
    });
    expect(result.status).toBe('PENDING');
    if (result.status === 'PENDING') {
      expect(result.attempts).toBe(3);
      expect(result.availableAt.getTime() - now.getTime()).toBe(
        outboxBackoffMs(3, 1000),
      );
    }
  });
});
