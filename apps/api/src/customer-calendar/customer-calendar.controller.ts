import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsString, MinLength } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import type { AuthenticatedUser } from '../users/user';
import { CustomerCalendarService } from './customer-calendar.service';

class ConnectCalendarDto {
  @IsIn(['GOOGLE', 'MICROSOFT'])
  provider!: 'GOOGLE' | 'MICROSOFT';

  @IsString()
  @MinLength(1)
  code!: string;
}

@Controller('customer/calendar')
export class CustomerCalendarController {
  constructor(private readonly calendar: CustomerCalendarService) {}

  @Get('connections')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.listConnections(user.id);
  }

  @Post('connections')
  @Idempotent()
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectCalendarDto,
  ) {
    return this.calendar.connectWithCode(user.id, dto.provider, dto.code);
  }

  @Delete('connections/:id')
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.calendar.disconnect(user.id, id);
  }

  @Post('ics')
  @Idempotent()
  createFeed(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.ensureIcsFeed(user.id);
  }
}

@Controller('public/customer-calendar')
export class PublicCustomerCalendarController {
  constructor(private readonly calendar: CustomerCalendarService) {}

  @Public()
  @Get('ics/:token')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = await this.calendar.buildIcsFeed(token);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return body;
  }
}
