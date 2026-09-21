import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationType, PlatformPlan, Role } from '@shedflow/db';
import {
  EventTypeQuestionsSchema,
  type EventTypeQuestions,
} from '@shedflow/shared';
import { UniqueConstraintError } from '../common/persistence';
import { MembershipRepository } from '../memberships/membership.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import { ScheduleRepository } from '../schedules/schedule.repository';
import { SchedulesService } from '../schedules/schedules.service';
import {
  CreateEventTypeData,
  EventTypeEntity,
  UpdateEventTypeData,
} from './event-type';
import { EventTypeRepository } from './event-type.repository';

export type EventTypeActor = {
  userId: string;
  role: Role;
};

const FREE_ACTIVE_LIMIT = 3;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class EventTypesService {
  constructor(
    private readonly eventTypes: EventTypeRepository,
    private readonly schedules: ScheduleRepository,
    private readonly schedulesService: SchedulesService,
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  list(organizationId: string, actor: EventTypeActor): Promise<EventTypeEntity[]> {
    return this.eventTypes.listByOrganization(organizationId).then((items) =>
      actor.role === Role.MEMBER
        ? items.filter((item) => item.hostUserId === actor.userId)
        : items,
    );
  }

  async get(
    organizationId: string,
    id: string,
    actor: EventTypeActor,
  ): Promise<EventTypeEntity> {
    const eventType = await this.eventTypes.findInOrganization(
      organizationId,
      id,
    );
    if (!eventType) {
      throw new NotFoundException('Not found');
    }
    if (actor.role === Role.MEMBER && eventType.hostUserId !== actor.userId) {
      throw new NotFoundException('Not found');
    }
    return eventType;
  }

  async create(
    organizationId: string,
    actor: EventTypeActor,
    input: Omit<CreateEventTypeData, 'organizationId' | 'hostUserId' | 'scheduleId'> & {
      hostUserId?: string;
      scheduleId?: string;
    },
  ): Promise<EventTypeEntity> {
    const hostUserId = await this.resolveHost(
      organizationId,
      actor,
      input.hostUserId,
    );
    const scheduleId = await this.resolveScheduleId(
      organizationId,
      hostUserId,
      input.scheduleId || undefined,
    );
    const questions = this.parseQuestions(input.questions ?? []);
    const slug = this.requireSlug(input.slug);
    const isActive = input.isActive ?? true;

    if (isActive) {
      await this.assertActiveQuota(organizationId, 1);
    }

    try {
      return await this.eventTypes.create({
        organizationId,
        hostUserId,
        scheduleId,
        slug,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        durationMinutes: input.durationMinutes,
        locationType: input.locationType,
        locationValue: input.locationValue ?? null,
        bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
        minNoticeMinutes: input.minNoticeMinutes ?? 60,
        maxDaysAhead: input.maxDaysAhead ?? 60,
        slotIntervalMinutes: input.slotIntervalMinutes ?? 0,
        dailyCap: input.dailyCap ?? null,
        requiresConfirmation: input.requiresConfirmation ?? false,
        cancellationNoticeHours: input.cancellationNoticeHours ?? 24,
        rescheduleNoticeHours: input.rescheduleNoticeHours ?? 24,
        priceId: input.priceId ?? null,
        subscriptionProductId: input.subscriptionProductId ?? null,
        creditCost: input.creditCost ?? 0,
        questions,
        isActive,
        isHidden: input.isHidden ?? false,
      });
    } catch (error) {
      throw this.slugConflict(error);
    }
  }

  async update(
    organizationId: string,
    id: string,
    actor: EventTypeActor,
    input: UpdateEventTypeData,
  ): Promise<EventTypeEntity> {
    const existing = await this.get(organizationId, id, actor);
    if (actor.role === Role.MEMBER && existing.hostUserId !== actor.userId) {
      throw new ForbiddenException('Insufficient role');
    }

    const patch: UpdateEventTypeData = { ...input };
    if (input.title !== undefined) {
      patch.title = input.title.trim();
    }
    if (input.description !== undefined) {
      patch.description = input.description.trim();
    }
    if (input.slug !== undefined) {
      patch.slug = this.requireSlug(input.slug);
    }
    if (input.questions !== undefined) {
      patch.questions = this.parseQuestions(input.questions);
    }
    if (input.hostUserId !== undefined) {
      patch.hostUserId = await this.resolveHost(
        organizationId,
        actor,
        input.hostUserId,
      );
    }
    if (input.scheduleId !== undefined) {
      await this.ensureSchedule(
        organizationId,
        input.scheduleId,
        patch.hostUserId ?? existing.hostUserId,
      );
    }

    if (input.isActive === true && !existing.isActive) {
      await this.assertActiveQuota(organizationId, 1);
    }

    try {
      return await this.eventTypes.updateInOrganization(
        organizationId,
        id,
        patch,
      );
    } catch (error) {
      throw this.slugConflict(error);
    }
  }

  async softDelete(
    organizationId: string,
    id: string,
    actor: EventTypeActor,
  ): Promise<EventTypeEntity> {
    await this.get(organizationId, id, actor);
    return this.eventTypes.updateInOrganization(organizationId, id, {
      isActive: false,
    });
  }

  async getPublicBySlug(
    organizationId: string,
    slug: string,
  ): Promise<EventTypeEntity> {
    const eventType = await this.eventTypes.findBySlug(organizationId, slug);
    if (!eventType || !eventType.isActive) {
      throw new NotFoundException('Not found');
    }
    return eventType;
  }

  listPublic(organizationId: string): Promise<EventTypeEntity[]> {
    return this.eventTypes.listPublicByOrganization(organizationId);
  }

  toPublic(eventType: EventTypeEntity) {
    return {
      slug: eventType.slug,
      title: eventType.title,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      questions: eventType.questions,
      requiresConfirmation: eventType.requiresConfirmation,
      price: null as { amountMinor: number; currency: string } | null,
    };
  }

  private async assertActiveQuota(
    organizationId: string,
    additional: number,
  ): Promise<void> {
    const org = await this.organizations.findActiveById(organizationId);
    if (!org || org.platformPlan !== PlatformPlan.FREE) {
      return;
    }
    const active = await this.eventTypes.countActive(organizationId);
    if (active + additional > FREE_ACTIVE_LIMIT) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message:
          'Free workspaces can publish 3 event types. Upgrade to Pro for more.',
      });
    }
  }

  private async resolveHost(
    organizationId: string,
    actor: EventTypeActor,
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

  private async resolveScheduleId(
    organizationId: string,
    hostUserId: string,
    scheduleId?: string,
  ): Promise<string> {
    if (scheduleId) {
      await this.ensureSchedule(organizationId, scheduleId, hostUserId);
      return scheduleId;
    }

    const existing = await this.schedules.listByHost(organizationId, hostUserId);
    const preferred =
      existing.find((schedule) => schedule.isDefault) ?? existing[0];
    if (preferred) {
      return preferred.id;
    }

    const org = await this.organizations.findActiveById(organizationId);
    const created = await this.schedulesService.createDefaultSchedule(
      organizationId,
      hostUserId,
      org?.timezone ?? 'UTC',
    );
    return created.id;
  }

  private async ensureSchedule(
    organizationId: string,
    scheduleId: string,
    hostUserId: string,
  ): Promise<void> {
    const schedule = await this.schedules.findInOrganization(
      organizationId,
      scheduleId,
    );
    if (!schedule) {
      throw new BadRequestException({
        fieldErrors: { scheduleId: ['Schedule not found'] },
      });
    }
    if (schedule.hostUserId !== hostUserId) {
      throw new BadRequestException({
        fieldErrors: {
          scheduleId: ['Schedule host must match event type host'],
        },
      });
    }
  }

  private requireSlug(slug: string): string {
    if (!SLUG_PATTERN.test(slug)) {
      throw new BadRequestException({
        fieldErrors: {
          slug: ['Slug must be lowercase letters, numbers, and hyphens'],
        },
      });
    }
    return slug;
  }

  private parseQuestions(value: unknown): EventTypeQuestions {
    const parsed = EventTypeQuestionsSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        fieldErrors: { questions: ['Invalid questions payload'] },
      });
    }
    return parsed.data;
  }

  private slugConflict(error: unknown): unknown {
    if (error instanceof UniqueConstraintError) {
      return new ConflictException({
        code: 'SLUG_TAKEN',
        message: 'Slug is already taken',
      });
    }
    return error;
  }
}

export const LOCATION_TYPES = Object.values(LocationType);
