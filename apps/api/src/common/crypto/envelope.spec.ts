import { DEV_ENCRYPTION_KEY_BASE64, EnvelopeCrypto } from '@shedflow/shared/envelope';


describe('EnvelopeCrypto', () => {
  it('round-trips plaintext', () => {
    const crypto = new EnvelopeCrypto(DEV_ENCRYPTION_KEY_BASE64);
    const enc = crypto.encrypt('refresh-token-secret');
    expect(Buffer.from(enc).includes(Buffer.from('refresh-token-secret'))).toBe(
      false,
    );
    expect(crypto.decrypt(enc)).toBe('refresh-token-secret');
  });
});
