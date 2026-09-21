import { Injectable } from '@nestjs/common';
import type { PlatformAccount as PlatformAccountRecord } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlatformAccountData,
  PlatformAccount,
  PlatformAccountFlags,
  PlatformAccountRepository,
} from './platform-account.repository';

@Injectable()
export class PrismaPlatformAccountRepository extends PlatformAccountRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findByOrganizationId(
    organizationId: string,
  ): Promise<PlatformAccount | null> {
    return this.prisma.platformAccount
      .findUnique({ where: { organizationId } })
      .then((row) => (row ? this.toEntity(row) : null));
  }

  findByStripeAccountId(
    stripeAccountId: string,
  ): Promise<PlatformAccount | null> {
    return this.prisma.platformAccount
      .findUnique({ where: { stripeAccountId } })
      .then((row) => (row ? this.toEntity(row) : null));
  }

  async create(data: CreatePlatformAccountData): Promise<PlatformAccount> {
    const row = await this.prisma.platformAccount.create({
      data: {
        organizationId: data.organizationId,
        stripeAccountId: data.stripeAccountId,
      },
    });
    return this.toEntity(row);
  }

  async updateFlags(
    organizationId: string,
    flags: PlatformAccountFlags,
  ): Promise<PlatformAccount> {
    const row = await this.prisma.platformAccount.update({
      where: { organizationId },
      data: flags,
    });
    return this.toEntity(row);
  }

  private toEntity(row: PlatformAccountRecord): PlatformAccount {
    return {
      organizationId: row.organizationId,
      stripeAccountId: row.stripeAccountId,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      detailsSubmitted: row.detailsSubmitted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
