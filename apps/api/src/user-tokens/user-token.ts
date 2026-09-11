import { UserTokenType } from '@shedflow/db';

export type UserToken = {
  id: string;
  userId: string;
  type: UserTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateUserTokenData = {
  userId: string;
  type: UserTokenType;
  tokenHash: string;
  expiresAt: Date;
};

export type UpdateUserTokenData = Partial<{
  usedAt: Date | null;
}>;
