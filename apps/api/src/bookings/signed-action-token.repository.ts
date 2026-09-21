import { Injectable } from '@nestjs/common';
import { Prisma, type SignedActionToken as TokenRecord } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSignedActionTokenData,
  SignedActionPurpose,
  SignedActionTokenEntity,
} from './signed-action-token';

@Injectable()
export class SignedActionTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateSignedActionTokenData,
  ): Promise<SignedActionTokenEntity> {
    const record = await this.prisma.activeClient().signedActionToken.create({
      data,
    });
    return toEntity(record);
  }

  async findByHash(
    tokenHash: string,
  ): Promise<SignedActionTokenEntity | null> {
    const record = await this.prisma
      .activeClient()
      .signedActionToken.findUnique({ where: { tokenHash } });
    return record ? toEntity(record) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.prisma.activeClient().signedActionToken.update({
      where: { id },
      data: { usedAt },
    });
  }

  async listByBooking(
    bookingId: string,
    purpose?: SignedActionPurpose,
  ): Promise<SignedActionTokenEntity[]> {
    const records = await this.prisma.activeClient().signedActionToken.findMany({
      where: {
        bookingId,
        ...(purpose ? { purpose } : {}),
      },
    });
    return records.map(toEntity);
  }
}

function toEntity(record: TokenRecord): SignedActionTokenEntity {
  return {
    id: record.id,
    bookingId: record.bookingId,
    purpose: record.purpose as SignedActionPurpose,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt,
    createdAt: record.createdAt,
  };
}
