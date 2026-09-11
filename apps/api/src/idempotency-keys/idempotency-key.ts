export type IdempotencyKey = {
  id: string;
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
};

export type CreateIdempotencyKeyData = {
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
};

export type UpdateIdempotencyKeyData = Partial<{
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
}>;
