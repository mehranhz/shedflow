import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class EnvelopeCrypto {
  private readonly key: Buffer;

  constructor(encryptionKeyBase64: string) {
    const key = Buffer.from(encryptionKeyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32-byte base64');
    }
    this.key = key;
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  decrypt(payload: Buffer | Uint8Array): string {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('ciphertext too short');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }
}

/** Dev/CI default: deterministic 32-byte key (never use in prod). */
export const DEV_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
