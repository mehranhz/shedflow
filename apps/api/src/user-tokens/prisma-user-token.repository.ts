import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type UserToken as UserTokenRecord,
} from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserTokenData,
  UpdateUserTokenData,
  UserToken,
} from './user-token';
import { UserTokenRepository } from './user-token.repository';

@Injectable()
export class PrismaUserTokenRepository
  extends PrismaRepository<
    UserTokenRecord,
    UserToken,
    CreateUserTokenData,
    UpdateUserTokenData
  >
  implements UserTokenRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'UserToken');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<UserTokenRecord> {
    return client.userToken;
  }

  protected toEntity(record: UserTokenRecord): UserToken {
    return {
      id: record.id,
      userId: record.userId,
      type: record.type,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt,
      createdAt: record.createdAt,
    };
  }

  findByTokenHash(tokenHash: string): Promise<UserToken | null> {
    return this.findOneWhere({ tokenHash });
  }
}
