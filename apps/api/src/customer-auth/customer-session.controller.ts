import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import type { BookingAnswers } from '@shedflow/shared';
import type { AuthenticatedUser } from '../users/user';
import { CustomerSecurityService } from '../customer-security/customer-security.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerBookingsService } from './customer-bookings.service';
import {
  CustomerProfileService,
  profileEtag,
} from './customer-profile.service';
import { UpdateCustomerProfileDto } from './dto/customer-profile.dto';
import {
  CancelCustomerBookingDto,
  CreateCustomerBookingDto,
  CustomerAttachmentDto,
  CustomerNoteDto,
  RescheduleCustomerBookingDto,
} from './dto/customer-booking.dto';

@Controller('customer')
export class CustomerSessionController {
  constructor(
    private readonly customers: CustomerAuthService,
    private readonly bookings: CustomerBookingsService,
    private readonly profiles: CustomerProfileService,
    private readonly security: CustomerSecurityService,
  ) {}

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.profiles.get(user.id, customerOrgId);
    res.setHeader('ETag', profileEtag(profile.user.updatedAt));
    return profile;
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateCustomerProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.profiles.update(user.id, customerOrgId, dto, ifMatch);
    res.setHeader('ETag', profileEtag(profile.user.updatedAt));
    return profile;
  }

  @Post('businesses/:organizationId/switch')
  switchBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.customers.switchBusiness(user, organizationId);
  }

  @Get('home')
  home(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId?: string,
  ) {
    return this.bookings.home(user.id, customerOrgId);
  }

  @Get('bookings')
  listBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Query('status') status?: string,
    @Query('tab') tab?: string,
    @Query('q') q?: string,
    @Query('upcoming') upcoming?: string,
  ) {
    return this.bookings.list(user.id, customerOrgId, { status, tab, q, upcoming });
  }

  @Get('bookings/:uid')
  booking(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Param('uid') uid: string,
  ) {
    return this.bookings.detail(user.id, customerOrgId, uid);
  }

  @Post('bookings')
  @Idempotent()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Body() dto: CreateCustomerBookingDto,
  ) {
    return this.bookings.create(user.id, customerOrgId, {
      ...dto,
      answers: dto.answers as BookingAnswers | undefined,
    });
  }

  @Post('bookings/:uid/cancel')
  @Idempotent()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Param('uid') uid: string,
    @Body() dto: CancelCustomerBookingDto,
  ) {
    return this.bookings.cancel(user.id, customerOrgId, uid, dto.reason, dto.scope);
  }

  @Post('bookings/:uid/reschedule')
  @Idempotent()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  rescheduleBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Param('uid') uid: string,
    @Body() dto: RescheduleCustomerBookingDto,
  ) {
    return this.bookings.reschedule(
      user.id,
      customerOrgId,
      uid,
      dto.startAt,
      dto.timezone,
    );
  }

  @Patch('bookings/:uid/note')
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Param('uid') uid: string,
    @Body() dto: CustomerNoteDto,
  ) {
    return this.bookings.updateNote(user.id, customerOrgId, uid, dto.customerNote);
  }

  @Post('bookings/:uid/attachments')
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Param('uid') uid: string,
    @Body() dto: CustomerAttachmentDto,
  ) {
    return this.bookings.addAttachment(user.id, customerOrgId, uid, dto);
  }
}
