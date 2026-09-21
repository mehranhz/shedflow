import { Injectable } from '@nestjs/common';
import type { Invoice as InvoiceRow } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvoiceRecord,
  InvoiceRepository,
  UpsertInvoiceData,
} from './invoice.repository';

@Injectable()
export class PrismaInvoiceRepository extends InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsertByStripeId(data: UpsertInvoiceData): Promise<InvoiceRecord> {
    const row = await this.prisma.invoice.upsert({
      where: { stripeInvoiceId: data.stripeInvoiceId },
      create: {
        organizationId: data.organizationId,
        customerId: data.customerId ?? null,
        stripeInvoiceId: data.stripeInvoiceId,
        amountDueMinor: data.amountDueMinor,
        amountPaidMinor: data.amountPaidMinor,
        currency: data.currency.toUpperCase().slice(0, 3),
        status: data.status,
        hostedInvoiceUrl: data.hostedInvoiceUrl ?? null,
        pdfUrl: data.pdfUrl ?? null,
      },
      update: {
        customerId: data.customerId ?? undefined,
        amountDueMinor: data.amountDueMinor,
        amountPaidMinor: data.amountPaidMinor,
        currency: data.currency.toUpperCase().slice(0, 3),
        status: data.status,
        hostedInvoiceUrl: data.hostedInvoiceUrl ?? null,
        pdfUrl: data.pdfUrl ?? null,
      },
    });
    return this.toEntity(row);
  }

  async findByStripeInvoiceId(
    stripeInvoiceId: string,
  ): Promise<InvoiceRecord | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { stripeInvoiceId },
    });
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: InvoiceRow): InvoiceRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      stripeInvoiceId: row.stripeInvoiceId,
      amountDueMinor: row.amountDueMinor,
      amountPaidMinor: row.amountPaidMinor,
      currency: row.currency,
      status: row.status,
      hostedInvoiceUrl: row.hostedInvoiceUrl,
      pdfUrl: row.pdfUrl,
      createdAt: row.createdAt,
    };
  }
}
