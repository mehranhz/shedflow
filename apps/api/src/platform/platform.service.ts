import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Role } from '@shedflow/db';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { MembershipRepository } from '../memberships/membership.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import type { AuthenticatedUser, PublicUser } from '../users/user';

@Injectable()
export class PlatformService {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async impersonate(
    actor: PublicUser,
    organizationId: string,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<{
    accessToken: string;
    organizationId: string;
    role: Role;
    impersonatingOrgId: string;
  }> {
    const org = await this.organizations.findActiveById(organizationId);
    if (!org) {
      throw new NotFoundException('Not found');
    }

    const accessToken = await this.auth.issueImpersonationAccess(
      actor,
      organizationId,
    );

    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      actorType: 'user',
      action: 'platform.impersonate',
      resourceType: 'organization',
      resourceId: organizationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        actorEmail: actor.email,
        impersonatingOrgId: organizationId,
      },
    });

    return {
      accessToken,
      organizationId,
      role: Role.ADMIN,
      impersonatingOrgId: organizationId,
    };
  }

  async stopImpersonation(user: AuthenticatedUser): Promise<{
    accessToken: string;
    organizationId: string | null;
    role: Role | null;
  }> {
    const memberships = await this.memberships.listByUserId(user.id);
    const active = memberships.find(
      (m) => m.status === MembershipStatus.ACTIVE,
    );
    if (!active) {
      const accessToken = await this.auth.issueAccessWithoutOrg(user);
      return { accessToken, organizationId: null, role: null };
    }
    const issued = await this.auth.issueAccessForOrganization(
      user,
      active.organizationId,
      active.role,
    );
    return {
      accessToken: issued.accessToken,
      organizationId: issued.organizationId,
      role: issued.role,
    };
  }
}
