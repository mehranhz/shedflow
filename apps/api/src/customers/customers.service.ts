import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@shedflow/db';
import {
  Page,
  PageRequest,
  TransactionManager,
} from '../common/persistence';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomerEntity,
  UpdateCustomerData,
  UpsertCustomerInput,
} from './customer';
import { CustomerRepository } from './customer.repository';

export type CustomerExport = {
  customer: CustomerEntity;
  bookings: Array<{
    id: string;
    uid: string;
    startAt: Date;
    endAt: Date;
    status: string;
    timezone: string;
    answers: Prisma.JsonValue;
    paymentId: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }>;
};

/** GDPR anonymized mailbox — unique per customer id, non-deliverable. */
export function anonymizedCustomerEmail(customerId: string): string {
  return `deleted+${customerId}@invalid.invalid`;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionManager,
  ) {}

  list(
    organizationId: string,
    request: PageRequest<CustomerEntity> = {},
  ): Promise<Page<CustomerEntity>> {
    return this.customers.listInOrganization(organizationId, request);
  }

  async get(organizationId: string, id: string): Promise<CustomerEntity> {
    const customer = await this.customers.findInOrganization(
      organizationId,
      id,
    );
    if (!customer) {
      throw new NotFoundException('Not found');
    }
    return customer;
  }

  upsert(
    organizationId: string,
    input: UpsertCustomerInput,
  ): Promise<CustomerEntity> {
    return this.customers.upsert(organizationId, input);
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerEntity> {
    await this.get(organizationId, id);
    return this.customers.updateInOrganization(organizationId, id, data);
  }

  async export(
    organizationId: string,
    id: string,
  ): Promise<CustomerExport> {
    const customer = await this.get(organizationId, id);
    const bookings = await this.prisma.booking.findMany({
      where: { organizationId, customerId: id },
      orderBy: { startAt: 'asc' },
      take: 1000,
    });
    return {
      customer,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        uid: booking.uid,
        startAt: booking.startAt,
        endAt: booking.endAt,
        status: booking.status,
        timezone: booking.timezone,
        answers: booking.answers,
        paymentId: booking.paymentId,
        metadata: booking.metadata,
        createdAt: booking.createdAt,
      })),
    };
  }

  /**
   * Erasure: anonymize PII; keep booking time rows for host calendar integrity.
   */
  async erase(organizationId: string, id: string): Promise<CustomerEntity> {
    await this.get(organizationId, id);
    return this.transactions.runInTransaction(async () => {
      const client = this.prisma.activeClient();
      await client.booking.updateMany({
        where: { organizationId, customerId: id },
        data: { answers: {} },
      });
      return this.customers.updateInOrganization(organizationId, id, {
        email: anonymizedCustomerEmail(id),
        name: 'Deleted',
        phone: null,
        notes: '',
      });
    });
  }
}
