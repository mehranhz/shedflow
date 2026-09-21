import {
  signInternalRequest,
  verifyInternalRequest,
} from '@shedflow/shared';

describe('internalAuth', () => {
  const secret = 'test-internal-secret';
  const now = new Date('2026-01-01T00:00:00.000Z');
  const base = {
    secret,
    timestamp: String(Math.floor(now.getTime() / 1000)),
    method: 'POST',
    path: '/internal/bookings/1/expire',
    body: '{"ok":true}',
  };

  it('accepts a matching signature within the skew window', () => {
    const signature = signInternalRequest(base);
    expect(
      verifyInternalRequest({
        ...base,
        signature,
        now,
      }),
    ).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    const signature = signInternalRequest(base);
    expect(
      verifyInternalRequest({
        ...base,
        signature,
        now: new Date(now.getTime() + 31_000),
      }),
    ).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = signInternalRequest(base);
    expect(
      verifyInternalRequest({
        ...base,
        signature,
        body: '{"ok":false}',
        now,
      }),
    ).toBe(false);
  });
});
