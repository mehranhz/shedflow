import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns';
import {
  BookingSource,
  BookingStatus,
  PlatformPlan,
  Role,
} from '@shedflow/db';
import { BookingAnswersSchema, DOMAIN_EVENTS, isValidTimeZone, type BookingAnswers } from '@shedflow/shared';
import { Clock } from '../common/clock/clock';
import {
  Page,
  PageRequest,
  TransactionManager,
} from '../common/persistence';
import { CustomersService } from '../customers/customers.service';
import { Outbox } from '../domain-events/outbox';
import { EventTypeRepository } from '../event-types/event-type.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import {
  BookingEntity,
  BookingListFilter,
} from './booking';
import { BillingCheckoutClient } from './billing-checkout.client';
import { BillingCreditsClient } from './billing-credits.client';
import { BookingRepository } from './booking.repository';
import {
  generateActionToken,
  generateBookingUid,
  hashActionToken,
  SignedActionPurpose,
} from './signed-action-token';
import { SignedActionTokenRepository } from './signed-action-token.repository';

export type BookingActor = {
  userId: string;
  role: Role;
};

export type CreatePublicBookingInput = {
  orgSlug: string;
  eventTypeSlug: string;
  startAt: Date;
  timezone: string;
  invitee: { name: string; email: string; phone?: string };
  answers?: BookingAnswers;
  metadata?: Record<string, unknown>;
  source: BookingSource;
};

export type PublicBookingResult = BookingEntity & {
  checkoutUrl?: string | null;
  actionTokens?: Record<string, string>;
};

const HOLD_MINUTES = 15;
const TOKEN_TTL_DAYS = 30;
const ACTIVE = new Set<BookingStatus>([
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.CONFIRMED,
]);

@Injectable()
export class BookingsService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly tokens: SignedActionTokenRepository,
    private readonly eventTypes: EventTypeRepository,
    private readonly organizations: OrganizationRepository,
    private readonly customers: CustomersService,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
    private readonly billing: BillingCheckoutClient,
    private readonly credits: BillingCreditsClient,
    private readonly config: ConfigService,
  ) {}

  list(
    organizationId: string,
    actor: BookingActor,
    filter: BookingListFilter,
    request?: PageRequest<BookingEntity>,
  ): Promise<Page<BookingEntity>> {
    const scoped: BookingListFilter = {
      ...filter,
      ...(actor.role === Role.MEMBER ? { hostUserId: actor.userId } : {}),
    };
    return this.bookings.listInOrganization(organizationId, scoped, request);
  }

  async get(
    organizationId: string,
    id: string,
    actor: BookingActor,
  ): Promise<BookingEntity> {
    const booking = await this.bookings.findInOrganization(organizationId, id);
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    if (actor.role === Role.MEMBER && booking.hostUserId !== actor.userId) {
      throw new NotFoundException('Not found');
    }
    return booking;
  }

  async getByUid(uid: string): Promise<BookingEntity> {
    const booking = await this.bookings.findByUid(uid);
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    return booking;
  }

  async createPublic(
    input: CreatePublicBookingInput,
  ): Promise<PublicBookingResult> {
    const org = await this.organizations.findBySlug(input.orgSlug);
    if (!org || org.deletedAt) {
      throw new NotFoundException('Not found');
    }
    const booking = await this.createBooking(org.id, {
      eventTypeSlug: input.eventTypeSlug,
      startAt: input.startAt,
      timezone: input.timezone,
      invitee: input.invitee,
      answers: input.answers,
      metadata: input.metadata,
      source: input.source,
    });
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      return booking;
    }
    return this.attachCheckout(booking, input.invitee);
  }

  async retryCheckout(uid: string): Promise<{ checkoutUrl: string | null }> {
    const booking = await this.bookings.findByUid(uid);
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Checkout is only available for pending payment bookings',
      });
    }
    const eventType = await this.eventTypes.findInOrganization(
      booking.organizationId,
      booking.eventTypeId,
    );
    if (!eventType?.priceId) {
      throw new UnprocessableEntityException({
        message: 'Booking has no price',
      });
    }
    const customer = await this.customers.get(
      booking.organizationId,
      booking.customerId,
    );
    const result = await this.attachCheckout(booking, {
      email: customer.email,
      name: customer.name,
    });
    return { checkoutUrl: result.checkoutUrl ?? null };
  }

  async createHost(
    organizationId: string,
    actor: BookingActor,
    input: {
      eventTypeId: string;
      startAt: Date;
      timezone: string;
      invitee: { name: string; email: string; phone?: string };
      answers?: BookingAnswers;
    },
  ): Promise<BookingEntity> {
    const eventType = await this.eventTypes.findInOrganization(
      organizationId,
      input.eventTypeId,
    );
    if (!eventType || !eventType.isActive) {
      throw new NotFoundException('Not found');
    }
    if (actor.role === Role.MEMBER && eventType.hostUserId !== actor.userId) {
      throw new ForbiddenException('Insufficient role');
    }
    return this.createBooking(organizationId, {
      eventTypeSlug: eventType.slug,
      startAt: input.startAt,
      timezone: input.timezone,
      invitee: input.invitee,
      answers: input.answers,
      source: BookingSource.DASHBOARD,
    });
  }

  async cancelPublic(
    uid: string,
    token: string,
    reason?: string,
  ): Promise<BookingEntity> {
    const booking = await this.getByUid(uid);
    await this.consumeToken(booking, token, 'cancel', true);
    return this.cancelBooking(booking, reason, false);
  }

  async cancelHost(
    organizationId: string,
    id: string,
    actor: BookingActor,
    reason?: string,
  ): Promise<BookingEntity> {
    const booking = await this.get(organizationId, id, actor);
    return this.cancelBooking(booking, reason, true);
  }

  async reschedulePublic(
    uid: string,
    token: string,
    startAt: Date,
    timezone: string,
  ): Promise<BookingEntity> {
    const booking = await this.getByUid(uid);
    await this.consumeToken(booking, token, 'reschedule', false);
    return this.rescheduleBooking(booking, startAt, timezone, false);
  }

  async rescheduleHost(
    organizationId: string,
    id: string,
    actor: BookingActor,
    startAt: Date,
    timezone: string,
  ): Promise<BookingEntity> {
    const booking = await this.get(organizationId, id, actor);
    return this.rescheduleBooking(booking, startAt, timezone, true);
  }

  async confirmHost(
    organizationId: string,
    id: string,
    actor: BookingActor,
  ): Promise<BookingEntity> {
    const booking = await this.get(organizationId, id, actor);
    if (booking.status !== BookingStatus.PENDING_CONFIRMATION) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Booking cannot be confirmed',
      });
    }
    return this.transactions.runInTransaction(async () => {
      const updated = await this.bookings.updateInOrganization(
        organizationId,
        id,
        { status: BookingStatus.CONFIRMED },
      );
      const actionTokens = await this.issueRawTokens(updated);
      await this.outbox.emit(
        DOMAIN_EVENTS.BookingConfirmed,
        { bookingId: updated.id, uid: updated.uid, actionTokens },
        organizationId,
      );
      return updated;
    });
  }

  async markNoShow(
    organizationId: string,
    id: string,
    actor: BookingActor,
  ): Promise<BookingEntity> {
    const booking = await this.get(organizationId, id, actor);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Only confirmed bookings can be marked no-show',
      });
    }
    return this.bookings.updateInOrganization(organizationId, id, {
      status: BookingStatus.NO_SHOW,
    });
  }

  async confirmInternal(id: string): Promise<BookingEntity> {
    const booking = await this.bookings.findById(id);
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    if (
      booking.status !== BookingStatus.PENDING_CONFIRMATION &&
      booking.status !== BookingStatus.PENDING_PAYMENT &&
      booking.status !== BookingStatus.EXPIRED
    ) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Booking cannot be confirmed',
      });
    }
    return this.transactions.runInTransaction(async () => {
      const updated = await this.bookings.updateInOrganization(
        booking.organizationId,
        id,
        { status: BookingStatus.CONFIRMED, holdExpiresAt: null },
      );
      const actionTokens = await this.issueRawTokens(updated);
      await this.outbox.emit(
        DOMAIN_EVENTS.BookingConfirmed,
        { bookingId: updated.id, uid: updated.uid, actionTokens },
        booking.organizationId,
      );
      return updated;
    });
  }

  async expireInternal(id: string): Promise<BookingEntity> {
    return this.transactions.runInTransaction(async () => {
      const updated = await this.bookings.casStatus(
        id,
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.EXPIRED,
        { holdExpiresAt: null },
      );
      if (!updated) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Booking is not pending payment',
        });
      }
      await this.outbox.emit(
        DOMAIN_EVENTS.BookingExpired,
        { bookingId: updated.id, uid: updated.uid },
        updated.organizationId,
      );
      return updated;
    });
  }

  private async createBooking(
    organizationId: string,
    input: {
      eventTypeSlug: string;
      startAt: Date;
      timezone: string;
      invitee: { name: string; email: string; phone?: string };
      answers?: BookingAnswers;
      metadata?: Record<string, unknown>;
      source: BookingSource;
    },
  ): Promise<BookingEntity> {
    this.requireTimeZone(input.timezone);
    if (Number.isNaN(input.startAt.getTime())) {
      throw new BadRequestException({
        fieldErrors: { startAt: ['Invalid startAt'] },
      });
    }

    let creditCost = 0;
    let creditCustomerId: string | null = null;

    try {
      const booking = await this.transactions.runInTransaction(async () => {
        const eventType = await this.eventTypes.findBySlug(
          organizationId,
          input.eventTypeSlug,
        );
        if (!eventType || !eventType.isActive) {
          throw new NotFoundException('Not found');
        }
        await this.eventTypes.lockForShare(organizationId, eventType.id);

        const answers = this.parseAnswers(input.answers ?? {});
        this.validateAnswers(eventType.questions, answers);

        const customer = await this.customers.upsert(organizationId, {
          email: input.invitee.email,
          name: input.invitee.name,
          phone: input.invitee.phone ?? null,
          timezone: input.timezone,
        });

        const endAt = addMinutes(input.startAt, eventType.durationMinutes);
        const paid = Boolean(eventType.priceId);
        if (paid) {
          const org = await this.organizations.findActiveById(organizationId);
          if (!org || org.platformPlan !== PlatformPlan.PRO) {
            throw new ForbiddenException({
              code: 'FEATURE_GATED',
              message: 'Paid bookings require a Pro plan',
            });
          }
        }
        creditCost = !paid && eventType.creditCost > 0 ? eventType.creditCost : 0;
        creditCustomerId = creditCost > 0 ? customer.id : null;
        const status = paid
          ? BookingStatus.PENDING_PAYMENT
          : eventType.requiresConfirmation
            ? BookingStatus.PENDING_CONFIRMATION
            : BookingStatus.CONFIRMED;
        const now = this.clock.now();

        const created = await this.bookings.create({
          uid: generateBookingUid(),
          organizationId,
          eventTypeId: eventType.id,
          hostUserId: eventType.hostUserId,
          customerId: customer.id,
          startAt: input.startAt,
          endAt,
          bufferBeforeMinutes: eventType.bufferBeforeMinutes,
          bufferAfterMinutes: eventType.bufferAfterMinutes,
          timezone: input.timezone,
          status,
          source: input.source,
          locationType: eventType.locationType,
          locationValue: eventType.locationValue,
          answers,
          metadata: input.metadata ?? {},
          holdExpiresAt: paid
            ? addMinutes(now, HOLD_MINUTES)
            : null,
        });

        const actionTokens = await this.issueRawTokens(created);
        await this.outbox.emit(
          DOMAIN_EVENTS.BookingCreated,
          {
            bookingId: created.id,
            uid: created.uid,
            status: created.status,
            actionTokens,
          },
          organizationId,
        );
        if (paid) {
          await this.outbox.emit(
            DOMAIN_EVENTS.BookingPaymentRequired,
            {
              bookingId: created.id,
              uid: created.uid,
              holdExpiresAt: created.holdExpiresAt?.toISOString() ?? null,
            },
            organizationId,
          );
        }
        if (status === BookingStatus.CONFIRMED) {
          await this.outbox.emit(
            DOMAIN_EVENTS.BookingConfirmed,
            {
              bookingId: created.id,
              uid: created.uid,
              actionTokens,
            },
            organizationId,
          );
        }
        return Object.assign(created, { actionTokens });
      });

      if (creditCost > 0 && creditCustomerId) {
        const debit = await this.credits.consume({
          organizationId,
          customerId: creditCustomerId,
          bookingId: booking.id,
          cost: creditCost,
        });
        if (debit !== 'ok') {
          await this.bookings.updateInOrganization(organizationId, booking.id, {
            status: BookingStatus.EXPIRED,
            holdExpiresAt: null,
          });
          throw new UnprocessableEntityException({
            code: 'INSUFFICIENT_CREDITS',
            message:
              debit === 'insufficient'
                ? 'Insufficient credits'
                : 'Credits service unavailable',
          });
        }
      }

      return booking;
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'That time is no longer available.',
          details: { startAt: input.startAt.toISOString() },
        });
      }
      throw error;
    }
  }

  private async cancelBooking(
    booking: BookingEntity,
    reason: string | undefined,
    hostOverride: boolean,
  ): Promise<BookingEntity> {
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.EXPIRED ||
      booking.status === BookingStatus.RESCHEDULED
    ) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Booking cannot be cancelled',
      });
    }

    if (!hostOverride) {
      const eventType = await this.eventTypes.findInOrganization(
        booking.organizationId,
        booking.eventTypeId,
      );
      const noticeHours = eventType?.cancellationNoticeHours ?? 24;
      const earliest = addMinutes(
        this.clock.now(),
        noticeHours * 60,
      );
      if (booking.startAt.getTime() < earliest.getTime()) {
        throw new UnprocessableEntityException({
          code: 'OUTSIDE_POLICY',
          message: 'Cancellation is outside the allowed notice window',
        });
      }
    }

    return this.transactions.runInTransaction(async () => {
      const updated = await this.bookings.updateInOrganization(
        booking.organizationId,
        booking.id,
        {
          status: BookingStatus.CANCELLED,
          cancellationReason: reason ?? null,
          holdExpiresAt: null,
        },
      );
      await this.outbox.emit(
        DOMAIN_EVENTS.BookingCancelled,
        { bookingId: updated.id, uid: updated.uid },
        booking.organizationId,
      );
      return updated;
    }).then(async (updated) => {
      await this.credits.release({
        organizationId: updated.organizationId,
        customerId: updated.customerId,
        bookingId: updated.id,
      });
      return updated;
    });
  }

  private async rescheduleBooking(
    booking: BookingEntity,
    startAt: Date,
    timezone: string,
    hostOverride: boolean,
  ): Promise<BookingEntity> {
    this.requireTimeZone(timezone);
    if (!ACTIVE.has(booking.status)) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Booking cannot be rescheduled',
      });
    }
    if (!hostOverride) {
      const eventType = await this.eventTypes.findInOrganization(
        booking.organizationId,
        booking.eventTypeId,
      );
      const noticeHours = eventType?.rescheduleNoticeHours ?? 24;
      const earliest = addMinutes(this.clock.now(), noticeHours * 60);
      if (booking.startAt.getTime() < earliest.getTime()) {
        throw new UnprocessableEntityException({
          code: 'OUTSIDE_POLICY',
          message: 'Reschedule is outside the allowed notice window',
        });
      }
    }

    const eventType = await this.eventTypes.findInOrganization(
      booking.organizationId,
      booking.eventTypeId,
    );
    if (!eventType || !eventType.isActive) {
      throw new NotFoundException('Not found');
    }

    try {
      return await this.transactions.runInTransaction(async () => {
        const endAt = addMinutes(startAt, eventType.durationMinutes);
        const created = await this.bookings.create({
          uid: generateBookingUid(),
          organizationId: booking.organizationId,
          eventTypeId: booking.eventTypeId,
          hostUserId: booking.hostUserId,
          customerId: booking.customerId,
          startAt,
          endAt,
          bufferBeforeMinutes: booking.bufferBeforeMinutes,
          bufferAfterMinutes: booking.bufferAfterMinutes,
          timezone,
          status:
            booking.status === BookingStatus.PENDING_PAYMENT
              ? BookingStatus.PENDING_PAYMENT
              : booking.status === BookingStatus.PENDING_CONFIRMATION
                ? BookingStatus.PENDING_CONFIRMATION
                : BookingStatus.CONFIRMED,
          source: booking.source,
          locationType: booking.locationType,
          locationValue: booking.locationValue,
          answers: booking.answers,
          rescheduledFromId: booking.id,
          holdExpiresAt:
            booking.status === BookingStatus.PENDING_PAYMENT
              ? addMinutes(this.clock.now(), HOLD_MINUTES)
              : null,
        });

        await this.bookings.updateInOrganization(
          booking.organizationId,
          booking.id,
          { status: BookingStatus.RESCHEDULED, holdExpiresAt: null },
        );
        const actionTokens = await this.issueRawTokens(created);
        await this.outbox.emit(
          DOMAIN_EVENTS.BookingRescheduled,
          {
            fromId: booking.id,
            toId: created.id,
            fromUid: booking.uid,
            toUid: created.uid,
            actionTokens,
          },
          booking.organizationId,
        );
        return Object.assign(created, { actionTokens });
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'That time is no longer available.',
        });
      }
      throw error;
    }
  }

  private async issueRawTokens(
    booking: BookingEntity,
  ): Promise<Record<SignedActionPurpose, string>> {
    const expiresAt = addMinutes(booking.endAt, TOKEN_TTL_DAYS * 24 * 60);
    const raw: Record<SignedActionPurpose, string> = {
      manage: generateActionToken(),
      cancel: generateActionToken(),
      reschedule: generateActionToken(),
    };
    for (const purpose of Object.keys(raw) as SignedActionPurpose[]) {
      await this.tokens.create({
        bookingId: booking.id,
        purpose,
        tokenHash: hashActionToken(raw[purpose]),
        expiresAt,
      });
    }
    return raw;
  }

  private async consumeToken(
    booking: BookingEntity,
    rawToken: string,
    purpose: SignedActionPurpose,
    oneTime: boolean,
  ): Promise<void> {
    const token = await this.tokens.findByHash(hashActionToken(rawToken));
    if (
      !token ||
      token.bookingId !== booking.id ||
      token.purpose !== purpose ||
      token.expiresAt.getTime() < this.clock.now().getTime() ||
      (oneTime && token.usedAt)
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired token',
      });
    }
    if (oneTime) {
      await this.tokens.markUsed(token.id, this.clock.now());
    }
  }

  private async attachCheckout(
    booking: BookingEntity,
    invitee: { email: string; name: string },
  ): Promise<PublicBookingResult> {
    const eventType = await this.eventTypes.findInOrganization(
      booking.organizationId,
      booking.eventTypeId,
    );
    if (!eventType?.priceId || !booking.holdExpiresAt) {
      return { ...booking, checkoutUrl: null };
    }

    const appUrl = this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '');
    const session = await this.billing.createCheckoutSession({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      customerId: booking.customerId,
      priceId: eventType.priceId,
      invitee,
      successUrl: `${appUrl}/b/${booking.uid}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/b/${booking.uid}`,
      expiresAt: booking.holdExpiresAt.toISOString(),
    });

    if (!session) {
      return { ...booking, checkoutUrl: null };
    }

    const updated = await this.bookings.updateInOrganization(
      booking.organizationId,
      booking.id,
      { paymentId: session.paymentId },
    );
    return { ...updated, checkoutUrl: session.url };
  }

  private requireTimeZone(timezone: string): void {
    if (timezone !== 'UTC' && !isValidTimeZone(timezone)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Invalid IANA timezone',
      });
    }
  }

  private parseAnswers(value: unknown): BookingAnswers {
    const parsed = BookingAnswersSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_ANSWER',
        message: 'Invalid answers',
      });
    }
    return parsed.data;
  }

  private validateAnswers(
    questions: Array<{ id: string; required: boolean; type: string }>,
    answers: BookingAnswers,
  ): void {
    for (const question of questions) {
      const value = answers[question.id];
      if (question.required && (value === undefined || value === '')) {
        throw new BadRequestException({
          code: 'INVALID_QUESTION_ANSWER',
          message: `Missing answer for ${question.id}`,
        });
      }
    }
  }
}

export function isExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : '';
  const metaCode =
    'meta' in error &&
    error.meta &&
    typeof error.meta === 'object' &&
    'code' in error.meta &&
    typeof (error.meta as { code?: unknown }).code === 'string'
      ? (error.meta as { code: string }).code
      : '';
  return (
    code === '23P01' ||
    code === 'P2034' ||
    metaCode === '23P01' ||
    message.includes('bookings_host_occupied_excl') ||
    message.includes('exclusion constraint') ||
    message.includes('write conflict') ||
    message.includes('deadlock')
  );
}
