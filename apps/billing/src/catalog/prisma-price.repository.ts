import { Injectable } from '@nestjs/common';
import type { Price as PriceRecord } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogPrice,
  CreateCatalogPriceData,
  PriceRepository,
} from './price.repository';

@Injectable()
export class PrismaPriceRepository extends PriceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByProductId(
    organizationId: string,
    productId: string,
  ): Promise<CatalogPrice[]> {
    const rows = await this.prisma.price.findMany({
      where: { organizationId, productId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toEntity(row));
  }

  async findById(
    organizationId: string,
    priceId: string,
  ): Promise<CatalogPrice | null> {
    const row = await this.prisma.price.findFirst({
      where: { id: priceId, organizationId },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByStripePriceId(
    organizationId: string,
    stripePriceId: string,
  ): Promise<CatalogPrice | null> {
    const row = await this.prisma.price.findFirst({
      where: { stripePriceId, organizationId },
    });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateCatalogPriceData): Promise<CatalogPrice> {
    const row = await this.prisma.price.create({
      data: {
        productId: data.productId,
        organizationId: data.organizationId,
        amountMinor: data.amountMinor,
        currency: data.currency,
        interval: data.interval,
        intervalCount: data.intervalCount ?? 1,
        stripePriceId: data.stripePriceId,
      },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PriceRecord): CatalogPrice {
    return {
      id: row.id,
      productId: row.productId,
      organizationId: row.organizationId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      interval: row.interval,
      intervalCount: row.intervalCount,
      stripePriceId: row.stripePriceId,
      isActive: row.isActive,
      createdAt: row.createdAt,
    };
  }
}
