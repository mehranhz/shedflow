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
      createdAt: record.createdAt,
    };
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.findOneWhere({ tokenHash });
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.run(async () => {
      await this.db.activeClient().refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt },
      });
    });
  }
}
