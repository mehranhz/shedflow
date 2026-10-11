import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import type { AuthenticatedUser } from '../users/user';
import { CustomerNotificationsService } from './customer-notifications.service';

class UpdatePrefsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  receiptsEnabled?: boolean;

  @IsOptional()
  @IsString()
  quietHoursStart?: string | null;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;
}

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
export class CustomerNotificationsController {
  constructor(private readonly notifications: CustomerNotificationsService) {}

  @Get('prefs')
  getPrefs(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPrefs(user.id);
  }

  @Put('prefs')
  @Idempotent()
  updatePrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePrefsDto,
  ) {
    return this.notifications.updatePrefs(user.id, dto);
  }

  @Post('sms/opt-in')
  @Idempotent()
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
  @Idempotent()
  subscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushSubscribeDto,
  ) {
    return this.notifications.subscribePush(user.id, dto);
  }
}
