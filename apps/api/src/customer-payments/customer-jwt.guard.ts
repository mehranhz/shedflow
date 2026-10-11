import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../users/user';
import { WAVE9_CUSTOMER_AUTH_CONTRACT } from './wave9-contracts';

/**
 * Minimal customer-route guard (Wave 9 stub).
 * Requires a JWT user (not API key). Org RBAC is not applied.
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const user = request.user;
    if (!user?.id) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }
    if (user.actorType === 'api_key') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Customer routes do not accept API keys',
      });
    }
    // Document Wave 9 active-org header for later wiring.
    void WAVE9_CUSTOMER_AUTH_CONTRACT.activeOrgHeader;
    return true;
  }
}
