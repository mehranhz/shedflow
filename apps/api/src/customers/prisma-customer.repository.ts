import { Injectable } from '@nestjs/common';
import { Prisma, type Customer as CustomerRecord } from '@shedflow/db';
import {
  Page,
  PageRequest,
  buildPage,
  resolvePageRequest,
} from '../common/persistence';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerData,
  CustomerEntity,
  UpdateCustomerData,
  UpsertCustomerInput,
} from './customer';
import { CustomerRepository } from './customer.repository';

@Injectable()
export class PrismaCustomerRepository
  extends PrismaRepository<
    CustomerRecord,
    CustomerEntity,
    CreateCustomerData,
    UpdateCustomerData
  >
  implements CustomerRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'Customer');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<CustomerRecord> {
    return client.customer;
  }

  protected toEntity(record: CustomerRecord): CustomerEntity {
    return {
      id: record.id,
      organizationId: record.organizationId,
      email: record.email,
      name: record.name,
      phone: record.phone,
      timezone: record.timezone,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<CustomerEntity | null> {
    return this.findOneWhere({ id, organizationId });
  }

  findByEmail(
    organizationId: string,
    email: string,
  ): Promise<CustomerEntity | null> {
    return this.findOneWhere({
      organizationId,
      email: email.trim().toLowerCase(),
    });
  }

  listInOrganization(
    organizationId: string,
    request: PageRequest<CustomerEntity> = {},
  ): Promise<Page<CustomerEntity>> {
    const { page, limit, skip, sort } = resolvePageRequest(request);
    return this.run(async () => {
      const where = { organizationId };
      const [records, total] = await Promise.all([
        this.model.findMany({
          where,
          skip,
          take: limit,
          ...(sort.length > 0 ? { orderBy: this.orderBy(sort) } : { orderBy: { createdAt: 'desc' } }),
        }),
        this.model.count({ where }),
      ]);
      return buildPage(
        records.map((record) => this.toEntity(record)),
        total,
        page,
        limit,
      );
    });
  }

  upsert(
    organizationId: string,
    input: UpsertCustomerInput,
  ): Promise<CustomerEntity> {
    const email = input.email.trim().toLowerCase();
    return this.run(async () => {
      const record = await this.model.upsert({
        where: {
          organizationId_email: { organizationId, email },
        },
        create: {
          organizationId,
          email,
          name: input.name.trim(),
          phone: input.phone ?? null,
          timezone: input.timezone ?? null,
        },
        update: {
          name: input.name.trim(),
          phone: input.phone ?? null,
          timezone: input.timezone ?? null,
        },
      });
      return this.toEntity(record);
    });
  }

  updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerEntity> {
    return this.run(async () => {
      const existing = await this.model.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new Error('Customer not found');
      }
      const record = await this.model.update({
        where: { id },
        data: this.toUpdateInput(data),
      });
      return this.toEntity(record);
    });
  }
}
