import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Role } from '@shedflow/db';
import { ROLES_KEY } from './roles.decorator';
import { readRequestContext } from './request-context.http';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed || allowed.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<object>();
    const current = readRequestContext(request);
    if (!current || !allowed.includes(current.role as Role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
