import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  type Booking as BookingRecord,
} from '@shedflow/db';
import { BookingAnswersSchema, type BookingAnswers } from '@shedflow/shared';
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
  BookingEntity,
  BookingListFilter,
  CreateBookingData,
  UpdateBookingData,
} from './booking';
import { BookingRepository } from './booking.repository';

@Injectable()
export class PrismaBookingRepository
  extends PrismaRepository<
    BookingRecord,
    BookingEntity,
    CreateBookingData,
    UpdateBookingData
  >
  implements BookingRepository
{
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService, 'Booking');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<BookingRecord> {
    return client.booking;
  }

  protected toCreateInput(data: CreateBookingData): object {
    return {
      ...data,
      answers: data.answers ?? {},
      metadata: data.metadata ?? {},
    };
  }

  protected toEntity(record: BookingRecord): BookingEntity {
    return {
      id: record.id,
      uid: record.uid,
      organizationId: record.organizationId,
      eventTypeId: record.eventTypeId,
      hostUserId: record.hostUserId,
      customerId: record.customerId,
      startAt: record.startAt,
      endAt: record.endAt,
      bufferBeforeMinutes: record.bufferBeforeMinutes,
      bufferAfterMinutes: record.bufferAfterMinutes,
      timezone: record.timezone,
      status: record.status,
      source: record.source,
      locationType: record.locationType,
      locationValue: record.locationValue,
      answers: parseAnswers(record.answers),
      cancellationReason: record.cancellationReason,
      rescheduledFromId: record.rescheduledFromId,
      paymentId: record.paymentId,
      subscriptionId: record.subscriptionId,
      holdExpiresAt: record.holdExpiresAt,
      metadata: asObject(record.metadata),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<BookingEntity | null> {
    return this.findOneWhere({ id, organizationId });
  }

  findByUid(uid: string): Promise<BookingEntity | null> {
    return this.findOneWhere({ uid });
  }

  listInOrganization(
    organizationId: string,
    filter: BookingListFilter,
    request: PageRequest<BookingEntity> = {},
  ): Promise<Page<BookingEntity>> {
    const { page, limit, skip } = resolvePageRequest(request);
    const where: Prisma.BookingWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.eventTypeId ? { eventTypeId: filter.eventTypeId } : {}),
      ...(filter.hostUserId ? { hostUserId: filter.hostUserId } : {}),
      ...(filter.from || filter.to
        ? {
            startAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    };
    return this.run(async () => {
      const [records, total] = await Promise.all([
        this.model.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startAt: 'asc' },
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

  listOccupiedForHost(
    hostUserId: string,
    from: Date,
    to: Date,
    statuses: BookingStatus[],
  ): Promise<BookingEntity[]> {
    return this.run(async () => {
      const records = await this.model.findMany({
        where: {
          hostUserId,
          status: { in: statuses },
          startAt: { lt: to },
          endAt: { gt: from },
        },
      });
      return records.map((record) => this.toEntity(record));
    });
  }

  countByEventTypeLocalDays(
    eventTypeId: string,
    timeZone: string,
    from: Date,
    to: Date,
    statuses: BookingStatus[],
  ): Promise<Map<string, number>> {
    return this.run(async () => {
      const records = await this.model.findMany({
        where: {
          eventTypeId,
          status: { in: statuses },
          startAt: { gte: from, lt: to },
        },
        select: { startAt: true },
      });
      const counts = new Map<string, number>();
      for (const record of records) {
        const key = formatLocalDate(record.startAt, timeZone);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    });
  }

  updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateBookingData,
  ): Promise<BookingEntity> {
    return this.run(async () => {
      const existing = await this.model.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new Error('Booking not found');
      }
      const record = await this.model.update({
        where: { id },
        data: this.toUpdateInput(data),
      });
      return this.toEntity(record);
    });
  }

  casStatus(
    id: string,
    fromStatus: BookingStatus,
    toStatus: BookingStatus,
    extra: UpdateBookingData = {},
  ): Promise<BookingEntity | null> {
    return this.run(async () => {
      const result = await this.model.updateMany({
        where: { id, status: fromStatus },
        data: { status: toStatus, ...extra },
      });
      if (result.count === 0) {
        return null;
      }
      const record = await this.model.findUnique({ where: { id } });
      return record ? this.toEntity(record) : null;
    });
  }
}

function parseAnswers(value: Prisma.JsonValue): BookingAnswers {
  const parsed = BookingAnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}
