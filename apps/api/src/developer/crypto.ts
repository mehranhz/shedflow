import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';

function resolveKey(raw?: string): Buffer {
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Dev fallback: derive from JWT secret so local boots without extra env.
  const seed = raw && raw.length > 0 ? raw : process.env.JWT_SECRET ?? 'dev';
  return createHash('sha256').update(seed).digest();
}

export function encryptSecret(plaintext: string, encryptionKey?: string): Buffer {
  const key = resolveKey(encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptSecret(
  payload: Buffer | Uint8Array,
  encryptionKey?: string,
): string {
  const key = resolveKey(encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY);
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function apiKeyPrefix(): 'sf_test_' | 'sf_live_' {
  return process.env.NODE_ENV === 'production' ? 'sf_live_' : 'sf_test_';
}

export function generateApiKeySecret(): { secret: string; prefix: string; keyHash: string } {
  const prefix = apiKeyPrefix();
  const random = randomBytes(24).toString('base64url');
  const secret = `${prefix}${random}`;
  return {
    secret,
    prefix: `${prefix}${random.slice(0, 8)}`,
    keyHash: hashApiKey(secret),
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}
