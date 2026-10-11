import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import type { AuthenticatedUser } from '../users/user';
import { CustomerAnalytics } from './customer-analytics';
import { CustomerGdprService } from './customer-gdpr.service';

/**
 * Customer-portal GDPR + mutating stubs (Wave 16 T-077 / T-081).
 * Does not replace staff `/v1/me` or org customer export (T-034).
 */
@Controller('customer')
export class CustomerPortalController {
  constructor(
    private readonly gdpr: CustomerGdprService,
    private readonly analytics: CustomerAnalytics,
  ) {}

  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.gdpr.exportForUser(user.id);
    this.analytics.track('customer_export_requested', { userId: user.id });
    if (result.mode === 'async') {
      res.status(202);
      return result;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="shedflow-customer-export.json"',
    );
    return result.payload;
  }

  @Get('export/:requestId')
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  async exportStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    const row = await this.gdpr.getExportRequest(user.id, requestId);
    if (!row) {
      throw new NotFoundException('Not found');
    }
    return row;
  }

  @Delete('account')
  @HttpCode(204)
  @Idempotent()
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
  async erase(@CurrentUser() user: AuthenticatedUser) {
    await this.gdpr.eraseAccount(user.id);
    this.analytics.track('customer_account_deleted', { userId: user.id });
  }

  /**
   * Stub cancel route for idempotency/rate-limit audit (T-081).
   * Full cancel logic lands with T-043 — this enforces Idempotency-Key only.
   */
  @Post('bookings/:uid/cancel')
  @Idempotent()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  cancelStub(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uid') uid: string,
  ) {
    this.analytics.track('customer_cancel_attempt', {
      userId: user.id,
      uid,
    });
    return {
      status: 'NOT_IMPLEMENTED',
      message:
        'Customer cancel is owned by T-043. Idempotency-Key + rate limit enforced here (T-081).',
      uid,
    };
  }
}
