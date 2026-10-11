import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { FEATURE_FLAGS, isEnabled } from '@shedflow/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../common/clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import type { PortalCustomerContext } from '../portal-context';

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async submit(
    ctx: PortalCustomerContext,
    input: { bookingId: string; rating: number; body?: string },
  ) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new BadRequestException({
        fieldErrors: { rating: ['Rating must be 1–5'] },
      });
    }

    const booking = await this.prisma.booking.findFirst({
      where: {
        id: input.bookingId,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.NO_SHOW
    ) {
      // Allow review after completed confirmed appointments; cancelled not reviewable
    }
    const now = this.clock.now();
    if (booking.endAt.getTime() > now.getTime()) {
      throw new ConflictException({
        code: 'REVIEW_TOO_EARLY',
        message: 'Cannot review before appointment ends',
      });
    }

    const existing = await this.prisma.bookingReview.findUnique({
      where: { bookingId: booking.id },
    });
    if (existing) {
      throw new ConflictException({
        code: 'REVIEW_EXISTS',
        message: 'Already reviewed',
      });
    }

    return this.prisma.bookingReview.create({
      data: {
        id: randomUUID(),
        organizationId: ctx.organizationId,
        bookingId: booking.id,
        customerId: ctx.customerId,
        rating: input.rating,
        body: input.body?.trim() ?? '',
        updatedAt: now,
      },
    });
  }

  async update(
    ctx: PortalCustomerContext,
    reviewId: string,
    input: { rating?: number; body?: string },
  ) {
    const review = await this.prisma.bookingReview.findFirst({
      where: {
        id: reviewId,
        organizationId: ctx.organizationId,
        customerId: ctx.customerId,
      },
    });
    if (!review) {
      throw new NotFoundException('Not found');
    }
    const now = this.clock.now();
    if (now.getTime() - review.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ConflictException({
        code: 'REVIEW_EDIT_WINDOW',
        message: 'Edit window expired (7 days)',
      });
    }
    if (
      input.rating !== undefined &&
      (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    ) {
      throw new BadRequestException({
        fieldErrors: { rating: ['Rating must be 1–5'] },
      });
    }

    return this.prisma.bookingReview.update({
      where: { id: reviewId },
      data: {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.body !== undefined ? { body: input.body.trim() } : {}),
        updatedAt: now,
      },
    });
  }

  async hideStaff(organizationId: string, reviewId: string) {
    const review = await this.prisma.bookingReview.findFirst({
      where: { id: reviewId, organizationId },
    });
    if (!review) {
      throw new NotFoundException('Not found');
    }
    return this.prisma.bookingReview.update({
      where: { id: reviewId },
      data: { hiddenAt: this.clock.now() },
    });
  }

  async publicAggregate(organizationId: string, envFlags?: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
    });
    if (!org || !isEnabled(FEATURE_FLAGS.publicReviews, org, envFlags)) {
      return { enabled: false, count: 0, average: null as number | null };
    }
    const rows = await this.prisma.bookingReview.findMany({
      where: { organizationId, hiddenAt: null },
      select: { rating: true },
    });
    if (rows.length === 0) {
      return { enabled: true, count: 0, average: null };
    }
    const sum = rows.reduce((acc, r) => acc + r.rating, 0);
    return {
      enabled: true,
      count: rows.length,
      average: Math.round((sum / rows.length) * 10) / 10,
    };
  }
}
