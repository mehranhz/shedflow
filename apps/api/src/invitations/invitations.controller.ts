import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user';
import { OrganizationsService } from '../organizations/organizations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post(':token/accept')
  @HttpCode(200)
  accept(
    @Param('token') token: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.organizations.acceptInvitation(token, user);
  }
}
