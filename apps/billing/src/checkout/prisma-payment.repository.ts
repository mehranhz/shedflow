import { Injectable } from '@nestjs/common';
import type { Payment as PaymentRow, PaymentStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentData,
  PaymentRecord,
  PaymentRepository,
} from './payment.repository';

@Injectable()
export class PrismaPaymentRepository extends PaymentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByBookingId(bookingId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByCheckoutSessionId(
    sessionId: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
    });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreatePaymentData): Promise<PaymentRecord> {
    const row = await this.prisma.payment.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        bookingId: data.bookingId,
        stripeCheckoutSessionId: data.stripeCheckoutSessionId,
        amountMinor: data.amountMinor,
        currency: data.currency,
        applicationFeeMinor: data.applicationFeeMinor,
        status: data.status,
      },
    });
    return this.toEntity(row);
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    patch?: {
      stripePaymentIntentId?: string | null;
      stripeCheckoutSessionId?: string | null;
    },
  ): Promise<PaymentRecord> {
    const row = await this.prisma.payment.update({
      where: { id },
      data: {
        status,
        stripePaymentIntentId: patch?.stripePaymentIntentId,
        stripeCheckoutSessionId: patch?.stripeCheckoutSessionId,
      },
    });
    return this.toEntity(row);
  }

  private toEntity(row: PaymentRow): PaymentRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      stripeCheckoutSessionId: row.stripeCheckoutSessionId,
      stripePaymentIntentId: row.stripePaymentIntentId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      applicationFeeMinor: row.applicationFeeMinor,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
