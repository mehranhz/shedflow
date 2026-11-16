import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken as RefreshTokenRecord } from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRefreshTokenData,
  RefreshToken,
  UpdateRefreshTokenData,
} from './refresh-token';
import { RefreshTokenRepository } from './refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository
  extends PrismaRepository<
    RefreshTokenRecord,
    RefreshToken,
    CreateRefreshTokenData,
    UpdateRefreshTokenData
  >
  implements RefreshTokenRepository
{
  constructor(private readonly db: PrismaService) {
    super(db, 'RefreshToken');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<RefreshTokenRecord> {
    return client.refreshToken;
  }

  protected toEntity(record: RefreshTokenRecord): RefreshToken {
    return {
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      replacedById: record.replacedById,
      userAgent: record.userAgent,
      ip: record.ip,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
    };
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.findOneWhere({ tokenHash });
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.revokeAllForUserExcept(userId, null, revokedAt);
  }

  async revokeAllForUserExcept(
    userId: string,
    exceptId: string | null,
    revokedAt: Date,
  ): Promise<void> {
    await this.run(async () => {
      await this.db.activeClient().refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        data: { revokedAt },
      });
    });
  }

  listActiveForUser(userId: string, now: Date): Promise<RefreshToken[]> {
    return this.run(async () => {
      const rows = await this.db.activeClient().refreshToken.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
      });
      return rows.map((row) => this.toEntity(row));
    });
  }
}
