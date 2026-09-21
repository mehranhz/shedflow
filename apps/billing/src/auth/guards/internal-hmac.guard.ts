import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  verifyInternalRequest,
} from '@shedflow/shared';
import type { Request } from 'express';

@Injectable()
export class InternalHmacGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const timestamp = req.header(INTERNAL_TIMESTAMP_HEADER) ?? '';
    const signature = req.header(INTERNAL_SIGNATURE_HEADER) ?? '';
    const secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
    const path = req.originalUrl.split('?')[0] ?? req.url;
    const body = req.rawBody ? req.rawBody.toString('utf8') : '';
    const ok = verifyInternalRequest({
      secret,
      timestamp,
      signature,
      method: req.method,
      path,
      body,
    });
    if (!ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid internal signature',
      });
    }
    return true;
  }
}
