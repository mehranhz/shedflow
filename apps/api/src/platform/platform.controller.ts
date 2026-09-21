import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../users/user';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformService } from './platform.service';

class ImpersonateDto {
  @IsUUID()
  organizationId!: string;
}

@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('impersonate')
  async impersonate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImpersonateDto,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.platform.impersonate(user, dto.organizationId, {
      ip: req.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  }

  @Post('impersonate/stop')
  @HttpCode(200)
  async stop(@CurrentUser() user: AuthenticatedUser) {
    if (!user.impersonatingOrgId) {
      throw new NotFoundException('Not found');
    }
    return this.platform.stopImpersonation(user);
  }
}
