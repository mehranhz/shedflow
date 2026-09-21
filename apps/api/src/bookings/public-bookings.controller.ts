import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  CreatePublicBookingDto,
  RescheduleBookingDto,
} from './dto/booking.dto';

@Public()
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Idempotent()
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  create(@Body() dto: CreatePublicBookingDto, @Req() _req: Request) {
    return this.bookings.createPublic({
      orgSlug: dto.orgSlug,
      eventTypeSlug: dto.eventTypeSlug,
      startAt: new Date(dto.startAt),
      timezone: dto.timezone,
      invitee: dto.invitee,
      answers: dto.answers,
      metadata: dto.metadata,
      source: dto.source,
    });
  }

  @Get(':uid')
  get(@Param('uid') uid: string) {
    return this.bookings.getByUid(uid);
  }

  @Post(':uid/cancel')
  cancel(@Param('uid') uid: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancelPublic(uid, dto.token ?? '', dto.reason);
  }

  @Post(':uid/reschedule')
  reschedule(@Param('uid') uid: string, @Body() dto: RescheduleBookingDto) {
    return this.bookings.reschedulePublic(
      uid,
      dto.token ?? '',
      new Date(dto.startAt),
      dto.timezone,
    );
  }

  @Post(':uid/checkout')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  checkout(@Param('uid') uid: string) {
    return this.bookings.retryCheckout(uid);
  }
}
