import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../users/user';

/**
 * Audits every authenticated HTTP request while a platform admin JWT carries
 * `impersonatingOrgId` (T-038).
 */
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const user = request.user;
    if (!user?.impersonatingOrgId) {
      return next.handle();
    }

    const method = request.method;
    const path = request.originalUrl ?? request.url;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.record({
            organizationId: user.impersonatingOrgId!,
            actorUserId: user.id,
            actorType: 'user',
            action: 'platform.impersonation.request',
            resourceType: 'http',
            resourceId: null,
            ip: request.ip ?? null,
            userAgent: typeof userAgent === 'string' ? userAgent : null,
            metadata: {
              method,
              path,
              impersonatingOrgId: user.impersonatingOrgId,
            },
          });
        },
      }),
    );
  }
}
