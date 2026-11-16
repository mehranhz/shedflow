import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import type { AuthenticatedUser } from '../users/user';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { CustomerNotificationsService } from './customer-notifications.service';

class SmsOptInDto {
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;
}

class PushSubscribeDto {
  @IsString()
  @MinLength(8)
  endpoint!: string;

  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

@Controller('customer/notifications')
@UseGuards(CustomerJwtGuard)
export class CustomerNotificationsController {
  constructor(private readonly notifications: CustomerNotificationsService) {}

  @Get('prefs')
  getPrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.notifications.getPrefs(user.id, organizationId);
  }

  @Patch('prefs')
  patchPrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId: string | undefined,
    @Body() dto: UpdateNotificationPrefsDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.updatePrefs(user.id, dto, {
      organizationId,
      ip: req.ip,
      userAgent,
    });
  }

  @Put('prefs')
  putPrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId: string | undefined,
    @Body() dto: UpdateNotificationPrefsDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.updatePrefs(user.id, dto, {
      organizationId,
      ip: req.ip,
      userAgent,
    });
  }

  @Post('sms/opt-in')
  optInSms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SmsOptInDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.optInSms(user.id, {
      phone: dto.phone,
      ip: req.ip,
      userAgent,
    });
  }

  @Delete('sms/opt-in')
  revokeSms(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.revokeSms(user.id);
  }

  @Get('sms/consent')
  smsConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.activeSmsConsent(user.id);
  }

  @Post('push/subscribe')
  subscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushSubscribeDto,
  ) {
    return this.notifications.subscribePush(user.id, dto);
  }
}
