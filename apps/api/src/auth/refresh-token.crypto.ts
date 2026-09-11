import { createHash, randomBytes } from 'node:crypto';

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}
