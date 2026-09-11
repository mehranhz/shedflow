import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@shedflow/db';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../users/user';
import { MembershipRepository } from '../../memberships/membership.repository';
import { OrganizationRepository } from '../../organizations/organization.repository';
import { ORGANIZATION_HEADER } from '../../organizations/organization.constants';
import { attachRequestContext } from './request-context.http';
import { readRequestId } from '../http/request-id.middleware';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser; params: { orgId?: string } }
    >();
    const user = request.user;
    if (!user) {
      throw new NotFoundException('Not found');
    }

    const orgId = this.resolveOrgId(request);
    if (!orgId || !UUID_RE.test(orgId)) {
      throw new NotFoundException('Not found');
    }

    const organization = await this.organizations.findActiveById(orgId);
    if (!organization) {
      throw new NotFoundException('Not found');
    }

    const membership = await this.memberships.findByUserInOrganization(
      orgId,
      user.id,
    );
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Not found');
    }

    const value = {
      requestId: readRequestId(request),
      userId: user.id,
      organizationId: orgId,
      role: membership.role,
      actorType: 'user' as const,
    };
    attachRequestContext(request, value);
    return true;
  }

  private resolveOrgId(
    request: Request & { user?: AuthenticatedUser; params: { orgId?: string } },
  ): string | undefined {
    if (typeof request.params.orgId === 'string' && request.params.orgId.length > 0) {
      return request.params.orgId;
    }
    const header = request.headers[ORGANIZATION_HEADER];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    return request.user?.orgId;
  }
}
