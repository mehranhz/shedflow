import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BookingStatus } from '@shedflow/db';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  CreateHostBookingDto,
  RescheduleBookingDto,
} from './dto/booking.dto';

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Query('status') status?: BookingStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('eventTypeId') eventTypeId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.bookings.list(
      orgId,
      ctx,
      {
        status,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        eventTypeId,
      },
      { page, limit },
    );
  }

  @Get(':id')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.bookings.get(orgId, id, ctx);
  }

  @Post()
  @Idempotent()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateHostBookingDto,
  ) {
    return this.bookings.createHost(orgId, ctx, {
      ...dto,
      startAt: new Date(dto.startAt),
    });
  }

  @Post(':id/cancel')
  cancel(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancelHost(orgId, id, ctx, dto.reason);
  }

  @Post(':id/reschedule')
  reschedule(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookings.rescheduleHost(
      orgId,
      id,
      ctx,
      new Date(dto.startAt),
      dto.timezone,
    );
  }

  @Post(':id/confirm')
  confirm(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.bookings.confirmHost(orgId, id, ctx);
  }

  @Post(':id/no-show')
  noShow(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.bookings.markNoShow(orgId, id, ctx);
  }
}
