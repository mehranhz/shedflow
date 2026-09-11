import { createHash, randomBytes } from 'node:crypto';

export function hashUserToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateUserToken(): string {
  return randomBytes(32).toString('base64url');
}
