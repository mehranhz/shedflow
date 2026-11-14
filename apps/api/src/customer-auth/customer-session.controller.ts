import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerBookingsService } from './customer-bookings.service';

@Controller('customer')
export class CustomerSessionController {
  constructor(
    private readonly customers: CustomerAuthService,
    private readonly bookings: CustomerBookingsService,
  ) {}

  @Get('me')
  me(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId?: string,
  ) {
    return this.customers.profile(user.id, customerOrgId);
  }

  @Post('businesses/:organizationId/switch')
  switchBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.customers.switchBusiness(user, organizationId);
  }

  @Get('bookings')
  listBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-customer-org-id') customerOrgId: string | undefined,
    @Query('status') status?: string,
  ) {
    return this.bookings.list(user.id, customerOrgId, status);
  }
}
