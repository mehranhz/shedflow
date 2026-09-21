import { Injectable } from '@nestjs/common';
import type {
  Subscription as SubscriptionRow,
  SubscriptionStatus,
} from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubscriptionRecord,
  SubscriptionRepository,
  UpsertSubscriptionData,
} from './subscription.repository';

@Injectable()
export class PrismaSubscriptionRepository extends SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<SubscriptionRecord | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    return row ? this.toEntity(row) : null;
  }

  async findActiveForCustomer(
    organizationId: string,
    customerId: string,
    productId?: string,
  ): Promise<SubscriptionRecord | null> {
    const row = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        customerId,
        ...(productId ? { productId } : {}),
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toEntity(row) : null;
  }

  async upsertByStripeId(
    data: UpsertSubscriptionData,
  ): Promise<SubscriptionRecord> {
    const row = await this.prisma.subscription.upsert({
      where: { stripeSubscriptionId: data.stripeSubscriptionId },
      create: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        productId: data.productId,
        priceId: data.priceId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      },
      update: {
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        productId: data.productId,
        priceId: data.priceId,
      },
    });
    return this.toEntity(row);
  }

  private toEntity(row: SubscriptionRow): SubscriptionRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      productId: row.productId,
      priceId: row.priceId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      status: row.status as SubscriptionStatus,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
