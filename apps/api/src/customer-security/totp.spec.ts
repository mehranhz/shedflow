import { generateTotpSecret, totpCode, verifyTotp } from './totp';

describe('totp', () => {
  it('accepts the current code and rejects a different code', () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const code = totpCode(secret, now);

    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code === '000000' ? '111111' : '000000', now)).toBe(
      false,
    );
  });
});
