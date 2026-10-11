import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../users/user';
import { CustomerPortalGuard, OptionalCustomerOrg } from '../portal-context';
import { NotificationsService } from './notifications.service';

@Controller('customer/notifications')
@UseGuards(CustomerPortalGuard)
@OptionalCustomerOrg()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.notifications.list(user.id, { page, limit });
  }

  @Post('read-all')
  @HttpCode(200)
  markAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  async markOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const row = await this.notifications.markRead(user.id, id);
    if (!row) {
      throw new NotFoundException('Not found');
    }
    return row;
  }
}
