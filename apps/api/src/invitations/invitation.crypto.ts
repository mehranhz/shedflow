import { createHash, randomBytes } from 'node:crypto';

export function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}
