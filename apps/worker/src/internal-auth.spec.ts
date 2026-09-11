import {
  signInternalRequest,
  verifyInternalRequest,
} from '@shedflow/shared';

describe('internalAuth', () => {
  const secret = 'test-internal-secret';
  const base = {
    secret,
    timestamp: '1000000',
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
        now: new Date(1_000_000),
      }),
    ).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    const signature = signInternalRequest(base);
    expect(
      verifyInternalRequest({
        ...base,
        signature,
        now: new Date(1_000_000 + 31_000),
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
        now: new Date(1_000_000),
      }),
    ).toBe(false);
  });
});
