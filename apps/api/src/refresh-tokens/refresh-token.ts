export type RefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
};

export type CreateRefreshTokenData = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
};

export type UpdateRefreshTokenData = Partial<{
  revokedAt: Date | null;
  replacedById: string | null;
}>;

export type RefreshTokenClientMeta = {
  userAgent?: string | null;
  ip?: string | null;
};
