import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@shedflow/db';
import { isValidTimeZone } from '@shedflow/shared';
import { TransactionManager } from '../common/persistence';
import { MembershipRepository } from '../memberships/membership.repository';
import {
  OverrideInput,
  RuleInput,
  ScheduleView,
  UpdateScheduleData,
} from './schedule';
import { ScheduleRepository } from './schedule.repository';

export type ScheduleActor = {
  userId: string;
  role: Role;
};

const DEFAULT_RULES: RuleInput[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 540,
  endMinute: 1020,
}));

@Injectable()
export class SchedulesService {
  constructor(
    private readonly schedules: ScheduleRepository,
    private readonly memberships: MembershipRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async createDefaultSchedule(
    organizationId: string,
    hostUserId: string,
    timezone: string,
  ): Promise<ScheduleView> {
    return this.transactions.runInTransaction(async () => {
      await this.schedules.clearDefaultForHost(organizationId, hostUserId);
      const schedule = await this.schedules.create({
        organizationId,
        hostUserId,
        name: 'Working hours',
        timezone,
        isDefault: true,
      });
      const rules = await this.schedules.replaceRules(schedule.id, DEFAULT_RULES);
      return { ...schedule, rules, overrides: [] };
    });
  }

  async list(
    organizationId: string,
    actor: ScheduleActor,
  ): Promise<ScheduleView[]> {
    const rows =
      actor.role === Role.MEMBER
        ? await this.schedules.listByHost(organizationId, actor.userId)
        : await this.schedules.listByOrganization(organizationId);
    return Promise.all(rows.map((row) => this.toView(row.id, organizationId)));
  }

  async get(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
  ): Promise<ScheduleView> {
    const schedule = await this.requireWritable(organizationId, id, actor, false);
    return this.toView(schedule.id, organizationId);
  }

  async create(
    organizationId: string,
    actor: ScheduleActor,
    input: {
      name: string;
      timezone: string;
      hostUserId?: string;
      isDefault?: boolean;
    },
  ): Promise<ScheduleView> {
    const hostUserId = await this.resolveHostUserId(
      organizationId,
      actor,
      input.hostUserId,
    );
    const timezone = this.requireTimeZone(input.timezone);

    return this.transactions.runInTransaction(async () => {
      if (input.isDefault) {
        await this.schedules.clearDefaultForHost(organizationId, hostUserId);
      }
      const schedule = await this.schedules.create({
        organizationId,
        hostUserId,
        name: input.name.trim(),
        timezone,
        isDefault: input.isDefault ?? false,
      });
      return { ...schedule, rules: [], overrides: [] };
    });
  }

  async update(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
    input: UpdateScheduleData,
  ): Promise<ScheduleView> {
    const existing = await this.requireWritable(organizationId, id, actor, true);
    const patch: UpdateScheduleData = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim();
    }
    if (input.timezone !== undefined) {
      patch.timezone = this.requireTimeZone(input.timezone);
    }
    if (input.isDefault !== undefined) {
      patch.isDefault = input.isDefault;
    }

    return this.transactions.runInTransaction(async () => {
      if (patch.isDefault) {
        await this.schedules.clearDefaultForHost(
          organizationId,
          existing.hostUserId,
          id,
        );
      }
      await this.schedules.updateInOrganization(organizationId, id, patch);
      return this.toView(id, organizationId);
    });
  }

  async remove(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
  ): Promise<void> {
    await this.requireWritable(organizationId, id, actor, true);
    await this.schedules.deleteInOrganization(organizationId, id);
  }

  async replaceRules(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
    rules: RuleInput[],
  ): Promise<ScheduleView> {
    await this.requireWritable(organizationId, id, actor, true);
    this.assertRulesValid(rules);
    await this.schedules.replaceRules(id, rules);
    return this.toView(id, organizationId);
  }

  async upsertOverride(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
    date: string,
    input: Omit<OverrideInput, 'date'>,
  ): Promise<ScheduleView> {
    await this.requireWritable(organizationId, id, actor, true);
    this.assertOverrideValid(date, input);
    await this.schedules.upsertOverride(id, { date, ...input });
    return this.toView(id, organizationId);
  }

  async deleteOverride(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
    date: string,
  ): Promise<void> {
    await this.requireWritable(organizationId, id, actor, true);
    await this.schedules.deleteOverride(id, date);
  }

  private async toView(
    id: string,
    organizationId: string,
  ): Promise<ScheduleView> {
    const schedule = await this.schedules.findInOrganization(organizationId, id);
    if (!schedule) {
      throw new NotFoundException('Not found');
    }
    const [rules, overrides] = await Promise.all([
      this.schedules.listRules(id),
      this.schedules.listOverrides(id),
    ]);
    return { ...schedule, rules, overrides };
  }

  private async requireWritable(
    organizationId: string,
    id: string,
    actor: ScheduleActor,
    write: boolean,
  ) {
    const schedule = await this.schedules.findInOrganization(organizationId, id);
    if (!schedule) {
      throw new NotFoundException('Not found');
    }
    if (
      write &&
      actor.role === Role.MEMBER &&
      schedule.hostUserId !== actor.userId
    ) {
      throw new ForbiddenException('Insufficient role');
    }
    if (
      !write &&
      actor.role === Role.MEMBER &&
      schedule.hostUserId !== actor.userId
    ) {
      throw new NotFoundException('Not found');
    }
    return schedule;
  }

  private async resolveHostUserId(
    organizationId: string,
    actor: ScheduleActor,
    requested?: string,
  ): Promise<string> {
    if (actor.role === Role.MEMBER) {
      if (requested && requested !== actor.userId) {
        throw new ForbiddenException('Insufficient role');
      }
      return actor.userId;
    }
    const hostUserId = requested ?? actor.userId;
    const membership = await this.memberships.findByUserInOrganization(
      organizationId,
      hostUserId,
    );
    if (!membership) {
      throw new BadRequestException({
        fieldErrors: { hostUserId: ['Host must be an organization member'] },
      });
    }
    return hostUserId;
  }

  private requireTimeZone(timezone: string): string {
    if (timezone !== 'UTC' && !isValidTimeZone(timezone)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Invalid IANA timezone',
        fieldErrors: { timezone: ['Invalid IANA timezone'] },
      });
    }
    return timezone;
  }

  private assertRulesValid(rules: RuleInput[]): void {
    for (const rule of rules) {
      if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
        throw new BadRequestException({
          fieldErrors: { dayOfWeek: ['dayOfWeek must be 0–6'] },
        });
      }
      if (
        rule.startMinute < 0 ||
        rule.endMinute > 1440 ||
        rule.startMinute >= rule.endMinute
      ) {
        throw new BadRequestException({
          fieldErrors: {
            rules: ['Each rule must satisfy 0 ≤ start < end ≤ 1440'],
          },
        });
      }
    }

    const byDay = new Map<number, RuleInput[]>();
    for (const rule of rules) {
      const list = byDay.get(rule.dayOfWeek) ?? [];
      list.push(rule);
      byDay.set(rule.dayOfWeek, list);
    }
    for (const dayRules of byDay.values()) {
      const sorted = [...dayRules].sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        if (curr.startMinute < prev.endMinute) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Overlapping availability windows for the same day',
            fieldErrors: {
              rules: ['Overlapping availability windows for the same day'],
            },
          });
        }
      }
    }
  }

  private assertOverrideValid(
    date: string,
    input: Omit<OverrideInput, 'date'>,
  ): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        fieldErrors: { date: ['Date must be YYYY-MM-DD'] },
      });
    }
    if (input.isUnavailable) {
      return;
    }
    if (
      input.startMinute == null ||
      input.endMinute == null ||
      input.startMinute < 0 ||
      input.endMinute > 1440 ||
      input.startMinute >= input.endMinute
    ) {
      throw new BadRequestException({
        fieldErrors: {
          startMinute: ['Available overrides require startMinute < endMinute'],
        },
      });
    }
  }
}
