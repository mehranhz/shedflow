import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PlatformPlan } from '@shedflow/db';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { OrganizationRepository } from '../organizations/organization.repository';
import { AuthenticatedUser } from '../users/user';
import { ApiKeyRepository } from './api-key.repository';
import { hashApiKey } from './crypto';

@Injectable()
export class ApiKeyOrJwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyRepository,
    private readonly organizations: OrganizationRepository,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const header = request.headers.authorization;
    if (typeof header === 'string' && /^Bearer\s+sf_(test|live)_/i.test(header)) {
      const secret = header.replace(/^Bearer\s+/i, '').trim();
      await this.authenticateApiKey(request, secret);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser>(err: Error | null, user: TUser, info?: Error): TUser {
    if (err || !user) {
      const expired =
        info?.name === 'TokenExpiredError' ||
        info?.message === 'jwt expired' ||
        err?.name === 'TokenExpiredError';
      if (expired) {
        throw new UnauthorizedException({
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
        });
      }
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    return user;
  }

  private async authenticateApiKey(
    request: Request & { user?: AuthenticatedUser },
    secret: string,
  ): Promise<void> {
    const expectedLive = this.config.get<string>('NODE_ENV') === 'production';
    const isLive = secret.startsWith('sf_live_');
    const isTest = secret.startsWith('sf_test_');
    if (expectedLive && isTest) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid API key',
      });
    }
    if (!isLive && !isTest) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid API key',
      });
    }

    const key = await this.apiKeys.findByHash(hashApiKey(secret));
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt.getTime() <= Date.now())
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid API key',
      });
    }

    const org = await this.organizations.findActiveById(key.organizationId);
    if (!org || org.platformPlan !== PlatformPlan.PRO) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid API key',
      });
    }

    const now = Date.now();
    const last = key.lastUsedAt?.getTime() ?? 0;
    if (now - last > 60_000) {
      await this.apiKeys.touchLastUsed(key.id, new Date(now));
    }

    request.user = {
      id: key.id,
      email: `apikey+${key.prefix}@schedflow.internal`,
      createdAt: key.createdAt,
      emailVerifiedAt: key.createdAt,
      orgId: key.organizationId,
      role: 'ADMIN',
      scopes: key.scopes,
      actorType: 'api_key',
    };
  }
}
