import { createHash, randomBytes } from 'node:crypto';

export type SignedActionPurpose = 'cancel' | 'reschedule' | 'manage';

export type SignedActionTokenEntity = {
  id: string;
  bookingId: string;
  purpose: SignedActionPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateSignedActionTokenData = {
  bookingId: string;
  purpose: SignedActionPurpose;
  tokenHash: string;
  expiresAt: Date;
};

const TOKEN_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

export function generateActionToken(size = 32): string {
  const bytes = randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += TOKEN_ALPHABET[bytes[i]! & 63];
  }
  return out;
}

export function hashActionToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateBookingUid(size = 21): string {
  return generateActionToken(size);
}
