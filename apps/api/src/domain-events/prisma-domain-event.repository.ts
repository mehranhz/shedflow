import { Injectable } from '@nestjs/common';
import {
  DomainEventStatus,
  Prisma,
  type DomainEvent as DomainEventRecord,
} from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDomainEventData,
  DomainEvent,
  UpdateDomainEventData,
} from './domain-event';
import { DomainEventRepository } from './domain-event.repository';

@Injectable()
export class PrismaDomainEventRepository
  extends PrismaRepository<
    DomainEventRecord,
    DomainEvent,
    CreateDomainEventData,
    UpdateDomainEventData
  >
  implements DomainEventRepository
{
  constructor(prisma: PrismaService) {
    super(prisma, 'DomainEvent');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<DomainEventRecord> {
    return client.domainEvent;
  }

  protected toEntity(record: DomainEventRecord): DomainEvent {
    return {
      id: record.id,
      organizationId: record.organizationId,
      type: record.type,
      payload: asJsonObject(record.payload),
      status: record.status,
      attempts: record.attempts,
      availableAt: record.availableAt,
      processedAt: record.processedAt,
      lastError: record.lastError,
      createdAt: record.createdAt,
    };
  }

  findById(_id: string): Promise<DomainEvent | null> {
    return Promise.reject(
      new Error('DomainEvent lookups require organizationId'),
    );
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<DomainEvent | null> {
    return this.findOneWhere({ id, organizationId });
  }

  listByOrganization(organizationId: string): Promise<DomainEvent[]> {
    return this.findManyWhere({ organizationId });
  }

  async listPending(now: Date, limit: number): Promise<DomainEvent[]> {
    return this.run(async () => {
      const records = await this.model.findMany({
        where: {
          status: DomainEventStatus.PENDING,
          availableAt: { lte: now },
        },
        orderBy: { availableAt: 'asc' },
        take: limit,
      });
      return records.map((record) => this.toEntity(record));
    });
  }
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
