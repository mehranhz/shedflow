import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type AvailabilityRule as AvailabilityRuleRecord,
  type DateOverride as DateOverrideRecord,
  type Schedule as ScheduleRecord,
} from '@shedflow/db';
import {
  PrismaModelDelegate,
  PrismaRepository,
} from '../prisma/prisma.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityRuleEntity,
  CreateScheduleData,
  DateOverrideEntity,
  OverrideInput,
  RuleInput,
  ScheduleEntity,
  UpdateScheduleData,
} from './schedule';
import { ScheduleRepository } from './schedule.repository';

@Injectable()
export class PrismaScheduleRepository
  extends PrismaRepository<
    ScheduleRecord,
    ScheduleEntity,
    CreateScheduleData,
    UpdateScheduleData
  >
  implements ScheduleRepository
{
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService, 'Schedule');
  }

  protected delegate(
    client: Prisma.TransactionClient,
  ): PrismaModelDelegate<ScheduleRecord> {
    return client.schedule;
  }

  protected toEntity(record: ScheduleRecord): ScheduleEntity {
    return {
      id: record.id,
      organizationId: record.organizationId,
      hostUserId: record.hostUserId,
      name: record.name,
      timezone: record.timezone,
      isDefault: record.isDefault,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<ScheduleEntity | null> {
    return this.findOneWhere({ id, organizationId });
  }

  listByOrganization(organizationId: string): Promise<ScheduleEntity[]> {
    return this.findManyWhere({ organizationId });
  }

  listByHost(
    organizationId: string,
    hostUserId: string,
  ): Promise<ScheduleEntity[]> {
    return this.findManyWhere({ organizationId, hostUserId });
  }

  updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateScheduleData,
  ): Promise<ScheduleEntity> {
    return this.run(async () => {
      const record = await this.model.update({
        where: { id },
        data: this.toUpdateInput(data),
      });
      if (record.organizationId !== organizationId) {
        throw new Error('Schedule organization mismatch');
      }
      return this.toEntity(record);
    });
  }

  async deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      return;
    }
    await this.run(() => this.model.delete({ where: { id } }));
  }

  async clearDefaultForHost(
    organizationId: string,
    hostUserId: string,
    exceptId?: string,
  ): Promise<void> {
    await this.run(() =>
      this.model.updateMany({
        where: {
          organizationId,
          hostUserId,
          isDefault: true,
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        data: { isDefault: false },
      }),
    );
  }

  listRules(scheduleId: string): Promise<AvailabilityRuleEntity[]> {
    return this.run(async () => {
      const records = await this.prismaService
        .activeClient()
        .availabilityRule.findMany({
          where: { scheduleId },
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
        });
      return records.map(toRule);
    });
  }

  replaceRules(
    scheduleId: string,
    rules: RuleInput[],
  ): Promise<AvailabilityRuleEntity[]> {
    return this.run(async () => {
      const client = this.prismaService.activeClient();
      await client.availabilityRule.deleteMany({ where: { scheduleId } });
      if (rules.length === 0) {
        return [];
      }
      await client.availabilityRule.createMany({
        data: rules.map((rule) => ({
          scheduleId,
          dayOfWeek: rule.dayOfWeek,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        })),
      });
      const records = await client.availabilityRule.findMany({
        where: { scheduleId },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      });
      return records.map(toRule);
    });
  }

  listOverrides(scheduleId: string): Promise<DateOverrideEntity[]> {
    return this.run(async () => {
      const records = await this.prismaService
        .activeClient()
        .dateOverride.findMany({
          where: { scheduleId },
          orderBy: { date: 'asc' },
        });
      return records.map(toOverride);
    });
  }

  upsertOverride(
    scheduleId: string,
    input: OverrideInput,
  ): Promise<DateOverrideEntity> {
    return this.run(async () => {
      const date = parseDateOnly(input.date);
      const record = await this.prismaService.activeClient().dateOverride.upsert({
        where: {
          scheduleId_date: { scheduleId, date },
        },
        create: {
          scheduleId,
          date,
          isUnavailable: input.isUnavailable,
          startMinute: input.isUnavailable ? null : (input.startMinute ?? null),
          endMinute: input.isUnavailable ? null : (input.endMinute ?? null),
        },
        update: {
          isUnavailable: input.isUnavailable,
          startMinute: input.isUnavailable ? null : (input.startMinute ?? null),
          endMinute: input.isUnavailable ? null : (input.endMinute ?? null),
        },
      });
      return toOverride(record);
    });
  }

  async deleteOverride(scheduleId: string, date: string): Promise<void> {
    await this.run(() =>
      this.prismaService.activeClient().dateOverride.delete({
        where: {
          scheduleId_date: { scheduleId, date: parseDateOnly(date) },
        },
      }),
    );
  }
}

function toRule(record: AvailabilityRuleRecord): AvailabilityRuleEntity {
  return {
    id: record.id,
    scheduleId: record.scheduleId,
    dayOfWeek: record.dayOfWeek,
    startMinute: record.startMinute,
    endMinute: record.endMinute,
  };
}

function toOverride(record: DateOverrideRecord): DateOverrideEntity {
  return {
    id: record.id,
    scheduleId: record.scheduleId,
    date: formatDateOnly(record.date),
    isUnavailable: record.isUnavailable,
    startMinute: record.startMinute,
    endMinute: record.endMinute,
  };
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
