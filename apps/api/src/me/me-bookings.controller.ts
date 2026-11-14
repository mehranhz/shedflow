import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { MeBookingsService } from './me-bookings.service';

class CancelMeBookingDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('me/bookings')
export class MeBookingsController {
  constructor(private readonly bookings: MeBookingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.bookings.list(user.id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMeBookingDto,
  ) {
    return this.bookings.cancel(user.id, id, dto.reason);
  }
}
