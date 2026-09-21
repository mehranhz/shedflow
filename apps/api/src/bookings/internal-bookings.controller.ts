import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  verifyInternalRequest,
} from '@shedflow/shared';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Clock } from '../common/clock/clock';
import { BookingsService } from './bookings.service';

@Public()
@Controller('internal/bookings')
export class InternalBookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    this.assertInternal(req);
    return this.bookings.confirmInternal(id);
  }

  @Post(':id/expire')
  expire(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    this.assertInternal(req);
    return this.bookings.expireInternal(id);
  }

  private assertInternal(req: Request): void {
    const timestamp = req.header(INTERNAL_TIMESTAMP_HEADER) ?? '';
    const signature = req.header(INTERNAL_SIGNATURE_HEADER) ?? '';
    const secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
    const path = req.originalUrl.split('?')[0] ?? req.url;
    const ok = verifyInternalRequest({
      secret,
      timestamp,
      signature,
      method: req.method,
      path,
      body: '',
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
