import {
  decryptSecret,
  encryptSecret,
  generateApiKeySecret,
  hashApiKey,
} from './crypto';

describe('developer crypto', () => {
  it('round-trips encrypted secrets', () => {
    const key = 'a'.repeat(64);
    const enc = encryptSecret('whsec_abc', key);
    expect(decryptSecret(enc, key)).toBe('whsec_abc');
  });

  it('hashes API keys stably', () => {
    const { secret, keyHash, prefix } = generateApiKeySecret();
    expect(secret.startsWith('sf_')).toBe(true);
    expect(keyHash).toBe(hashApiKey(secret));
    expect(prefix.length).toBeGreaterThan(8);
  });
});
