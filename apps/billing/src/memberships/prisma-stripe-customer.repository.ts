import { Injectable } from '@nestjs/common';
import type { StripeCustomer as StripeCustomerRow } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  StripeCustomerRecord,
  StripeCustomerRepository,
} from './stripe-customer.repository';

@Injectable()
export class PrismaStripeCustomerRepository extends StripeCustomerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<StripeCustomerRecord | null> {
    const row = await this.prisma.stripeCustomer.findUnique({
      where: {
        organizationId_customerId: { organizationId, customerId },
      },
    });
    return row ? this.toEntity(row) : null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<StripeCustomerRecord | null> {
    const row = await this.prisma.stripeCustomer.findUnique({
      where: { stripeCustomerId },
    });
    return row ? this.toEntity(row) : null;
  }

  async upsert(data: {
    organizationId: string;
    customerId: string;
    stripeCustomerId: string;
  }): Promise<StripeCustomerRecord> {
    const row = await this.prisma.stripeCustomer.upsert({
      where: {
        organizationId_customerId: {
          organizationId: data.organizationId,
          customerId: data.customerId,
        },
      },
      create: data,
      update: { stripeCustomerId: data.stripeCustomerId },
    });
    return this.toEntity(row);
  }

  private toEntity(row: StripeCustomerRow): StripeCustomerRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      stripeCustomerId: row.stripeCustomerId,
    };
  }
}
