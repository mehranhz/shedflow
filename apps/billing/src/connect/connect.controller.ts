import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ConnectService, ConnectStatusResponse } from './connect.service';
import { OnboardConnectDto } from './dto/onboard-connect.dto';

@Controller('billing/organizations/:orgId/connect')
export class ConnectController {
  constructor(private readonly connect: ConnectService) {}

  @Post('onboard')
  onboard(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OnboardConnectDto,
  ): Promise<{ url: string }> {
    return this.connect.onboard(orgId, user, body.country ?? 'US');
  }

  @Get('status')
  status(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConnectStatusResponse> {
    return this.connect.status(orgId, user);
  }

  @Post('dashboard-link')
  dashboardLink(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return this.connect.dashboardLink(orgId, user);
  }
}
