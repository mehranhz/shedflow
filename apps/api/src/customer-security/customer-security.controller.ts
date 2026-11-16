import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import type { AuthenticatedUser } from '../users/user';
import { CustomerSecurityService, type SecurityContext } from './customer-security.service';
import {
  ChangePasswordDto,
  ConfirmTotpDto,
  DisableTotpDto,
  RevokeSessionsDto,
} from './dto/customer-security.dto';

/**
 * Passkeys / WebAuthn are a follow-up and are not part of this slice.
 * TOTP, backup codes, password change, and refresh-session revoke are.
 */
@Controller('customer/security')
@UseGuards(CustomerJwtGuard)
export class CustomerSecurityController {
  constructor(private readonly security: CustomerSecurityService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.security.overview(user.id);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.security.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.security.revokeSession(user.id, id, context(req));
  }

  @Post('sessions/revoke-all')
  @HttpCode(204)
  revokeAll(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeSessionsDto,
    @Req() req: Request,
  ) {
    return this.security.revokeAllSessions(
      user.id,
      Boolean(dto.keepCurrent),
      { ...context(req), sessionId: user.sessionId ?? null },
    );
  }

  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.security.changePassword(user.id, dto, {
      ...context(req),
      sessionId: user.sessionId ?? null,
    });
  }

  @Post('totp/enroll')
  @HttpCode(200)
  enroll(@CurrentUser() user: AuthenticatedUser) {
    return this.security.enroll(user.id);
  }

  @Post('totp/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmTotpDto,
    @Req() req: Request,
  ) {
    return this.security.confirmEnroll(user.id, dto.code, context(req));
  }

  @Post('totp/disable')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTotpDto,
    @Req() req: Request,
  ) {
    return this.security.disable(user.id, dto.password, dto.code, context(req));
  }
}

function context(req: Request): SecurityContext {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
}
