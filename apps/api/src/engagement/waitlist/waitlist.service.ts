import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, WaitlistStatus } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../common/clock/clock';
import { TransactionManager } from '../../common/persistence';
import { BookingsService } from '../../bookings/bookings.service';
import { Outbox } from '../../domain-events/outbox';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPrefsPort } from '../ports/notification-prefs.port';
import { NotificationsService } from '../notifications/notifications.service';
import type { PortalCustomerContext } from '../portal-context';

export const WAITLIST_CLAIM_HOLD_MS = 15 * 60 * 1000;

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
    private readonly bookings: BookingsService,
    private readonly prefs: NotificationPrefsPort,
    private readonly notifications: NotificationsService,
  ) {}

  list(ctx: PortalCustomerContext) {
    return this.prisma.waitlistEntry.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async join(
    ctx: PortalCustomerContext,
    input: {
      eventTypeId: string;
      preferFrom?: string | null;
      preferTo?: string | null;
    },
  ) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id: input.eventTypeId, organizationId: ctx.organizationId },
    });
    if (!eventType) {
      throw new NotFoundException('Not found');
    }

    const preferFrom = input.preferFrom ? new Date(input.preferFrom) : null;
    const preferTo = input.preferTo ? new Date(input.preferTo) : null;
    if (preferFrom && Number.isNaN(preferFrom.getTime())) {
      throw new BadRequestException({
        fieldErrors: { preferFrom: ['Invalid date'] },
      });
    }
    if (preferTo && Number.isNaN(preferTo.getTime())) {
      throw new BadRequestException({
        fieldErrors: { preferTo: ['Invalid date'] },
      });
    }

    const now = this.clock.now();
    return this.prisma.waitlistEntry.create({
      data: {
        id: randomUUID(),
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
        eventTypeId: input.eventTypeId,
        preferFrom,
        preferTo,
        status: WaitlistStatus.WAITING,
        updatedAt: now,
      },
    });
  }

  async leave(ctx: PortalCustomerContext, id: string): Promise<void> {
    const row = await this.prisma.waitlistEntry.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!row) {
      throw new NotFoundException('Not found');
    }
    await this.prisma.waitlistEntry.update({
      where: { id },
      data: {
        status: WaitlistStatus.CANCELLED,
        updatedAt: this.clock.now(),
      },
    });
  }

  /**
   * Called when a booking is cancelled / slot frees. Offers to first WAITING
   * entry (FIFO) with 15m claim hold.
   */
  async offerOnSlotFree(input: {
    organizationId: string;
    eventTypeId: string;
    slotStart: Date;
    slotEnd: Date;
    sourceBookingId?: string;
  }): Promise<{ offeredEntryId: string | null }> {
    return this.transactions.runInTransaction(async () => {
      const now = this.clock.now();
      await this.expireStaleOffers(input.organizationId, input.eventTypeId, now);

      const candidates = await this.prisma.waitlistEntry.findMany({
        where: {
          organizationId: input.organizationId,
          eventTypeId: input.eventTypeId,
          status: WaitlistStatus.WAITING,
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      const match = candidates.find((entry) =>
        this.matchesWindow(entry.preferFrom, entry.preferTo, input.slotStart),
      );
      if (!match) {
        return { offeredEntryId: null };
      }

      const offerExpiresAt = new Date(now.getTime() + WAITLIST_CLAIM_HOLD_MS);
      const updated = await this.prisma.waitlistEntry.updateMany({
        where: { id: match.id, status: WaitlistStatus.WAITING },
        data: {
          status: WaitlistStatus.OFFERED,
          offeredSlotStart: input.slotStart,
          offeredSlotEnd: input.slotEnd,
          offerExpiresAt,
          sourceBookingId: input.sourceBookingId ?? null,
          updatedAt: now,
        },
      });
      if (updated.count === 0) {
        return { offeredEntryId: null };
      }

      const customer = await this.prisma.customer.findFirst({
        where: { id: match.customerId, organizationId: input.organizationId },
      });
      if (!customer) {
        return { offeredEntryId: match.id };
      }

      const userId = customer.userId;
      const allowEmail = userId
        ? await this.prefs.allows(userId, 'waitlist', 'email')
        : true;
      const allowInbox = userId
        ? await this.prefs.allows(userId, 'waitlist', 'in_app')
        : true;

      if (userId && allowInbox) {
        await this.notifications.create({
          userId,
          organizationId: input.organizationId,
          type: 'waitlist.offer',
          title: 'A slot opened up',
          body: 'You have 15 minutes to claim this time.',
          href: `/portal/waitlist`,
        });
      }

      if (allowEmail) {
        await this.outbox.emit(
          DOMAIN_EVENTS.WaitlistOffer,
          {
            waitlistEntryId: match.id,
            organizationId: input.organizationId,
            customerId: match.customerId,
            eventTypeId: input.eventTypeId,
            slotStart: input.slotStart.toISOString(),
            slotEnd: input.slotEnd.toISOString(),
            offerExpiresAt: offerExpiresAt.toISOString(),
            toEmail: customer.email,
          },
          input.organizationId,
        );
      }

      return { offeredEntryId: match.id };
    });
  }

  async claim(
    ctx: PortalCustomerContext,
    entryId: string,
    timezone: string,
  ) {
    const now = this.clock.now();
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: {
        id: entryId,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!entry || entry.status !== WaitlistStatus.OFFERED) {
      throw new ConflictException({
        code: 'WAITLIST_NOT_OFFERED',
        message: 'No active offer to claim',
      });
    }
    if (!entry.offeredSlotStart || !entry.offerExpiresAt) {
      throw new ConflictException({
        code: 'WAITLIST_NOT_OFFERED',
        message: 'Offer incomplete',
      });
    }
    if (entry.offerExpiresAt.getTime() <= now.getTime()) {
      await this.prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: WaitlistStatus.EXPIRED, updatedAt: now },
      });
      throw new ConflictException({
        code: 'WAITLIST_OFFER_EXPIRED',
        message: 'Offer expired',
      });
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: ctx.organizationId },
    });
    const eventType = await this.prisma.eventType.findFirst({
      where: { id: entry.eventTypeId, organizationId: ctx.organizationId },
    });
    if (!org || !eventType) {
      throw new NotFoundException('Not found');
    }

    // Race: only one claimant wins via conditional status update after book attempt.
    const booking = await this.bookings.createPublic({
      orgSlug: org.slug,
      eventTypeSlug: eventType.slug,
      startAt: entry.offeredSlotStart,
      timezone,
      invitee: {
        name: ctx.customerName,
        email: ctx.userEmail,
      },
      metadata: {
        waitlistEntryId: entry.id,
        source: 'waitlist_claim',
      },
      source: BookingSource.HOSTED,
    });

    const won = await this.prisma.waitlistEntry.updateMany({
      where: {
        id: entry.id,
        status: WaitlistStatus.OFFERED,
      },
      data: {
        status: WaitlistStatus.CLAIMED,
        claimedBookingId: booking.id,
        updatedAt: now,
      },
    });
    if (won.count === 0) {
      throw new ConflictException({
        code: 'WAITLIST_CLAIM_RACE',
        message: 'Another claim won this offer',
      });
    }

    await this.transactions.runInTransaction(async () => {
      await this.outbox.emit(
        DOMAIN_EVENTS.WaitlistClaimed,
        {
          waitlistEntryId: entry.id,
          bookingId: booking.id,
        },
        ctx.organizationId,
      );
    });

    return booking;
  }

  private matchesWindow(
    preferFrom: Date | null,
    preferTo: Date | null,
    slotStart: Date,
  ): boolean {
    if (!preferFrom && !preferTo) {
      return true;
    }
    if (preferFrom && slotStart.getTime() < preferFrom.getTime()) {
      return false;
    }
    if (preferTo && slotStart.getTime() > preferTo.getTime()) {
      return false;
    }
    return true;
  }

  private async expireStaleOffers(
    organizationId: string,
    eventTypeId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.waitlistEntry.updateMany({
      where: {
        organizationId,
        eventTypeId,
        status: WaitlistStatus.OFFERED,
        offerExpiresAt: { lte: now },
      },
      data: { status: WaitlistStatus.EXPIRED, updatedAt: now },
    });
  }
}
