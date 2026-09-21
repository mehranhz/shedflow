import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type EventType as EventTypeRecord,
} from '@shedflow/db';
import { EventTypeQuestionsSchema, type EventTypeQuestions } from '@shedflow/shared';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEventTypeData,
  EventTypeEntity,
  UpdateEventTypeData,
} from './event-type';
import { EventTypeRepository } from './event-type.repository';

@Injectable()
export class PrismaEventTypeRepository
  extends PrismaRepository<
    EventTypeRecord,
    EventTypeEntity,
    CreateEventTypeData,
    UpdateEventTypeData
  >
  implements EventTypeRepository
{
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService, 'EventType');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<EventTypeRecord> {
    return client.eventType;
  }

  protected toCreateInput(data: CreateEventTypeData): object {
    return {
      ...data,
      questions: data.questions ?? [],
    };
  }

  protected toEntity(record: EventTypeRecord): EventTypeEntity {
    return {
      id: record.id,
      organizationId: record.organizationId,
      hostUserId: record.hostUserId,
      scheduleId: record.scheduleId,
      slug: record.slug,
      title: record.title,
      description: record.description,
      durationMinutes: record.durationMinutes,
      locationType: record.locationType,
      locationValue: record.locationValue,
      bufferBeforeMinutes: record.bufferBeforeMinutes,
      bufferAfterMinutes: record.bufferAfterMinutes,
      minNoticeMinutes: record.minNoticeMinutes,
      maxDaysAhead: record.maxDaysAhead,
      slotIntervalMinutes: record.slotIntervalMinutes,
      dailyCap: record.dailyCap,
      requiresConfirmation: record.requiresConfirmation,
      cancellationNoticeHours: record.cancellationNoticeHours,
      rescheduleNoticeHours: record.rescheduleNoticeHours,
      priceId: record.priceId,
      subscriptionProductId: record.subscriptionProductId,
      creditCost: record.creditCost,
      questions: parseQuestions(record.questions),
      isActive: record.isActive,
      isHidden: record.isHidden,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<EventTypeEntity | null> {
    return this.findOneWhere({ id, organizationId });
  }

  findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<EventTypeEntity | null> {
    return this.findOneWhere({ organizationId, slug });
  }

  listByOrganization(organizationId: string): Promise<EventTypeEntity[]> {
    return this.findManyWhere({ organizationId });
  }

  listPublicByOrganization(
    organizationId: string,
  ): Promise<EventTypeEntity[]> {
    return this.findManyWhere({
      organizationId,
      isActive: true,
      isHidden: false,
    });
  }

  countActive(organizationId: string): Promise<number> {
    return this.run(() =>
      this.model.count({ where: { organizationId, isActive: true } }),
    );
  }

  updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateEventTypeData,
  ): Promise<EventTypeEntity> {
    return this.run(async () => {
      const existing = await this.model.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new Error('EventType not found');
      }
      const record = await this.model.update({
        where: { id },
        data: this.toUpdateInput(data),
      });
      return this.toEntity(record);
    });
  }

  async lockForShare(organizationId: string, id: string): Promise<void> {
    await this.run(async () => {
      await this.prismaService.activeClient().$queryRaw`
        SELECT id FROM event_types
        WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
        FOR SHARE
      `;
    });
  }
}

function parseQuestions(value: Prisma.JsonValue): EventTypeQuestions {
  const parsed = EventTypeQuestionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
