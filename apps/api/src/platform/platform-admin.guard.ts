import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthenticatedUser } from '../users/user';
import { parsePlatformAdmins } from './platform-admins';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const admins = parsePlatformAdmins(
      this.config.get<string>('PLATFORM_ADMINS'),
    );
    // Empty allowlist → feature disabled (404), including listing the route.
    if (admins.size === 0) {
      throw new NotFoundException('Not found');
    }

    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const email = request.user?.email?.trim().toLowerCase();
    if (!email || !admins.has(email)) {
      throw new NotFoundException('Not found');
    }
    return true;
  }
}
