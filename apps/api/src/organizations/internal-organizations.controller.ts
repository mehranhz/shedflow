import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTERNAL_SIGNATURE_HEADER, INTERNAL_TIMESTAMP_HEADER, verifyInternalRequest } from '@shedflow/shared/internalAuth';
import { PlatformPlan } from '@shedflow/db';

import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Clock } from '../common/clock/clock';
import { OrganizationsService } from './organizations.service';

class UpdatePlatformPlanDto {
  @IsEnum(PlatformPlan)
  platformPlan!: PlatformPlan;

  @IsOptional()
  @IsString()
  platformStripeCustomerId?: string | null;

  @IsOptional()
  @IsString()
  platformStripeSubscriptionId?: string | null;
}

@Public()
@Controller('internal/organizations')
export class InternalOrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  @Post(':id/plan')
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePlatformPlanDto,
    @Req() req: Request,
  ) {
    this.assertInternal(req, body);
    return this.organizations.updatePlatformPlan(id, {
      platformPlan: body.platformPlan,
      platformStripeCustomerId: body.platformStripeCustomerId,
      platformStripeSubscriptionId: body.platformStripeSubscriptionId,
    });
  }

  private assertInternal(req: Request, body: unknown): void {
    const timestamp = req.header(INTERNAL_TIMESTAMP_HEADER) ?? '';
    const signature = req.header(INTERNAL_SIGNATURE_HEADER) ?? '';
    const secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
    const path = req.originalUrl.split('?')[0] ?? req.url;
    const raw =
      req.rawBody?.toString('utf8') ??
      (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    const ok = verifyInternalRequest({
      secret,
      timestamp,
      signature,
      method: 'POST',
      path,
      body: raw,
      now: this.clock.now(),
    });
    if (!ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid internal signature',
      });
    }
  }
}
