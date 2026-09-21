import { Injectable } from '@nestjs/common';
import type { Product as ProductRecord } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogProduct,
  CreateCatalogProductData,
  ProductRepository,
  UpdateCatalogProductData,
} from './product.repository';

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<CatalogProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toEntity(row));
  }

  async findById(
    organizationId: string,
    productId: string,
  ): Promise<CatalogProduct | null> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateCatalogProductData): Promise<CatalogProduct> {
    const row = await this.prisma.product.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        type: data.type,
        stripeProductId: data.stripeProductId,
        creditGrantPerPeriod: data.creditGrantPerPeriod,
      },
    });
    return this.toEntity(row);
  }

  async update(
    organizationId: string,
    productId: string,
    data: UpdateCatalogProductData,
  ): Promise<CatalogProduct> {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!existing) {
      throw new Error('Product not found');
    }
    const row = await this.prisma.product.update({
      where: { id: productId },
      data,
    });
    return this.toEntity(row);
  }

  private toEntity(row: ProductRecord): CatalogProduct {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      type: row.type,
      stripeProductId: row.stripeProductId,
      creditGrantPerPeriod: row.creditGrantPerPeriod,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
