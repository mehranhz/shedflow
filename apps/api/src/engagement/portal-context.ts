import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
  NotFoundException,
  CanActivate,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../users/user';

export const CUSTOMER_ORG_HEADER = 'x-customer-org-id';

export type PortalCustomerContext = {
  userId: string;
  userEmail: string;
  organizationId: string;
  customerId: string;
  customerName: string;
};

const PORTAL_CTX_KEY = 'shedflowPortalCustomer';

export function attachPortalCustomer(
  request: object,
  ctx: PortalCustomerContext,
): void {
  (request as Record<string, unknown>)[PORTAL_CTX_KEY] = ctx;
}

export function readPortalCustomer(
  request: object,
): PortalCustomerContext | undefined {
  return (request as Record<string, unknown>)[
    PORTAL_CTX_KEY
  ] as PortalCustomerContext | undefined;
}

export const CurrentPortalCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PortalCustomerContext => {
    const request = context.switchToHttp().getRequest<object>();
    const ctx = readPortalCustomer(request);
    if (!ctx) {
      throw new NotFoundException('Not found');
    }
    return ctx;
  },
);

/** When true, org header is optional (user-scoped routes like dependents / inbox). */
export const OPTIONAL_CUSTOMER_ORG = 'optionalCustomerOrg';
export const OptionalCustomerOrg = () => SetMetadata(OPTIONAL_CUSTOMER_ORG, true);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves the active Customer for a portal JWT user.
 * Prefers Customer.userId (Wave 9); falls back to email match until claim lands.
 */
@Injectable()
export class CustomerPortalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();
    const user = request.user;
    if (!user?.id || user.actorType === 'api_key') {
      throw new NotFoundException('Not found');
    }

    const optional =
      Reflect.getMetadata(
        OPTIONAL_CUSTOMER_ORG,
        context.getHandler(),
      ) === true ||
      Reflect.getMetadata(OPTIONAL_CUSTOMER_ORG, context.getClass()) === true;

    const orgHeader = request.headers[CUSTOMER_ORG_HEADER];
    const organizationId =
      typeof orgHeader === 'string' && orgHeader.length > 0
        ? orgHeader
        : undefined;

    if (!organizationId) {
      if (optional) {
        return true;
      }
      throw new NotFoundException('Not found');
    }
    if (!UUID_RE.test(organizationId)) {
      throw new NotFoundException('Not found');
    }

    const customer = await this.resolveCustomer(user.id, user.email, organizationId);
    if (!customer) {
      throw new NotFoundException('Not found');
    }

    attachPortalCustomer(request, {
      userId: user.id,
      userEmail: user.email,
      organizationId,
      customerId: customer.id,
      customerName: customer.name,
    });
    return true;
  }

  private async resolveCustomer(
    userId: string,
    email: string,
    organizationId: string,
  ): Promise<{ id: string; name: string } | null> {
    const byUser = await this.prisma.customer.findFirst({
      where: { organizationId, userId },
      select: { id: true, name: true },
    });
    if (byUser) {
      return byUser;
    }
    return this.prisma.customer.findFirst({
      where: {
        organizationId,
        email: email.trim().toLowerCase(),
      },
      select: { id: true, name: true },
    });
  }
}
