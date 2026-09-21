import { Injectable } from '@nestjs/common';
import type { Refund as RefundRow } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRefundData,
  RefundRecord,
  RefundRepository,
} from './refund.repository';

@Injectable()
export class PrismaRefundRepository extends RefundRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CreateRefundData): Promise<RefundRecord> {
    const row = await this.prisma.refund.create({
      data: {
        paymentId: data.paymentId,
        amountMinor: data.amountMinor,
        stripeRefundId: data.stripeRefundId,
        reason: data.reason ?? null,
      },
    });
    return this.toEntity(row);
  }

  async sumByPaymentId(paymentId: string): Promise<number> {
    const agg = await this.prisma.refund.aggregate({
      where: { paymentId },
      _sum: { amountMinor: true },
    });
    return agg._sum.amountMinor ?? 0;
  }

  async findByStripeRefundId(
    stripeRefundId: string,
  ): Promise<RefundRecord | null> {
    const row = await this.prisma.refund.findUnique({
      where: { stripeRefundId },
    });
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: RefundRow): RefundRecord {
    return {
      id: row.id,
      paymentId: row.paymentId,
      amountMinor: row.amountMinor,
      stripeRefundId: row.stripeRefundId,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }
}
