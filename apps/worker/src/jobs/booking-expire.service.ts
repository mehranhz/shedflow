import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import {
  BOOKING_EXPIRE_QUEUE,
  expireSingletonKey,
  type BookingExpireJobPayload,
} from './jobs.constants';
import { InternalBookingsClient } from './internal-bookings.client';

@Injectable()
export class BookingExpireService {
  private readonly logger = new Logger(BookingExpireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boss: PgBossService,
    private readonly internal: InternalBookingsClient,
  ) {}

  async scheduleIfNeeded(bookingId: string): Promise<Date | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (
      !booking ||
      booking.status !== BookingStatus.PENDING_PAYMENT ||
      !booking.holdExpiresAt
    ) {
      return null;
    }
    await this.boss.enqueueJob(
      BOOKING_EXPIRE_QUEUE,
      { bookingId } satisfies BookingExpireJobPayload,
      {
        startAfter: booking.holdExpiresAt,
        singletonKey: expireSingletonKey(bookingId),
      },
    );
    return booking.holdExpiresAt;
  }

  async handleExpire(payload: BookingExpireJobPayload): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
    });
    if (!booking) {
      return;
    }
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      this.logger.debug(
        `expire no-op status=${booking.status} booking=${payload.bookingId}`,
      );
      return;
    }
    await this.internal.expire(payload.bookingId);
  }
}
