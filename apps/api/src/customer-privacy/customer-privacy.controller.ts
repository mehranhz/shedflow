import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerJwtGuard } from '../customer-payments/customer-jwt.guard';
import type { AuthenticatedUser } from '../users/user';
import { CustomerPrivacyService, type PrivacyContext } from './customer-privacy.service';
import { UpdateConsentsDto } from './dto/update-consents.dto';

@Controller('customer/privacy')
@UseGuards(CustomerJwtGuard)
export class CustomerPrivacyController {
  constructor(private readonly privacy: CustomerPrivacyService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.privacy.overview(user.id);
  }

  @Patch('consents')
  updateConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateConsentsDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.privacy.updateConsents(user.id, dto, context(req, userAgent));
  }

  @Post('businesses/:organizationId/disconnect')
  @HttpCode(200)
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.privacy.disconnect(user.id, organizationId, context(req, userAgent));
  }
}

function context(req: Request, userAgent?: string): PrivacyContext {
  return { ip: req.ip ?? null, userAgent: userAgent ?? null };
}
