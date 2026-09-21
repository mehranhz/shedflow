import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PlatformBillingService } from './platform-billing.service';

class PlatformCheckoutDto {
  @IsIn(['month', 'year'])
  interval!: 'month' | 'year';
}

@Controller('billing/organizations/:orgId/platform')
export class PlatformBillingController {
  constructor(private readonly platform: PlatformBillingService) {}

  @Post('checkout')
  checkout(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PlatformCheckoutDto,
  ): Promise<{ url: string }> {
    return this.platform.checkout(orgId, user, body);
  }

  @Post('portal')
  portal(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return this.platform.portal(orgId, user);
  }
}
