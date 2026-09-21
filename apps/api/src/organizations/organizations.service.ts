import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Role } from '@shedflow/db';
import { isValidTimeZone, OrgSettingsSchema, DOMAIN_EVENTS } from '@shedflow/shared';
import { randomBytes } from 'node:crypto';
import { TransactionManager, UniqueConstraintError } from '../common/persistence';
import { Clock } from '../common/clock/clock';
import { AuditService } from '../audit/audit.service';
import { Outbox } from '../domain-events/outbox';
import {
  generateInvitationToken,
  hashInvitationToken,
} from '../invitations/invitation.crypto';
import { Invitation } from '../invitations/invitation';
import { InvitationRepository } from '../invitations/invitation.repository';
import { Membership } from '../memberships/membership';
import { MembershipRepository } from '../memberships/membership.repository';
import { PublicUser } from '../users/user';
import { UsersService } from '../users/users.service';
import {
  BRAND_COLOR_PATTERN,
  CURRENCY_PATTERN,
  INVITATION_TTL_MS,
  SLUG_PATTERN,
} from './organization.constants';
import { SchedulesService } from '../schedules/schedules.service';
import {
  Organization,
  PublicOrganization,
  UpdateOrganizationData,
} from './organization';
import { OrganizationRepository } from './organization.repository';
import { slugifyName, withSlugSuffix } from './slug';

export type OrgActor = {
  userId: string;
  role: Role;
};

export type MemberView = {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  createdAt: Date;
};

export type InvitationView = {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
  token?: string;
};

export type AuditRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly memberships: MembershipRepository,
    private readonly invitations: InvitationRepository,
    private readonly users: UsersService,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly config: ConfigService,
    private readonly outbox: Outbox,
    private readonly audit: AuditService,
    private readonly schedules: SchedulesService,
  ) {}

  async listForUser(userId: string): Promise<PublicOrganization[]> {
    const memberships = await this.memberships.listByUserId(userId);
    const orgs: PublicOrganization[] = [];
    for (const membership of memberships) {
      if (membership.status !== MembershipStatus.ACTIVE) {
        continue;
      }
      const org = await this.organizations.findActiveById(
        membership.organizationId,
      );
      if (org) {
        orgs.push(this.toPublic(org));
      }
    }
    return orgs;
  }

  async create(
    userId: string,
    input: {
      name: string;
      timezone?: string;
      locale?: string;
      currency?: string;
    },
    audit?: AuditRequestMeta,
  ): Promise<PublicOrganization> {
    const timezone = this.requireTimeZone(input.timezone ?? 'UTC');
    const locale = input.locale ?? 'en';
    const currency = this.requireCurrency(input.currency ?? 'USD');
    const slug = await this.allocateSlug(slugifyName(input.name));

    return this.transactions.runInTransaction(async () => {
      const organization = await this.organizations.create({
        name: input.name.trim(),
        slug,
        timezone,
        locale,
        currency,
        settings: {},
      });
      await this.memberships.create({
        organizationId: organization.id,
        userId,
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      await this.createDefaultScheduleIfAvailable(
        organization.id,
        userId,
        timezone,
      );
      await this.outbox.emit(
        DOMAIN_EVENTS.OrganizationCreated,
        {
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          actorUserId: userId,
        },
        organization.id,
      );
      await this.audit.record({
        organizationId: organization.id,
        actorUserId: userId,
        actorType: 'user',
        action: 'organization.create',
        resourceType: 'organization',
        resourceId: organization.id,
        ip: audit?.ip,
        userAgent: audit?.userAgent,
      });
      return this.toPublic(organization);
    });
  }

  async getForMember(
    organizationId: string,
    userId: string,
  ): Promise<PublicOrganization> {
    await this.requireActiveMembership(organizationId, userId);
    const organization = await this.organizations.findActiveById(organizationId);
    if (!organization) {
      throw new NotFoundException('Not found');
    }
    return this.toPublic(organization);
  }

  async update(
    organizationId: string,
    actor: OrgActor,
    input: UpdateOrganizationData & { settings?: Record<string, unknown> },
  ): Promise<PublicOrganization> {
    if (actor.role !== Role.OWNER) {
      throw new ForbiddenException('Insufficient role');
    }

    const patch: UpdateOrganizationData = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim();
    }
    if (input.slug !== undefined) {
      patch.slug = this.requireSlug(input.slug);
    }
    if (input.timezone !== undefined) {
      patch.timezone = this.requireTimeZone(input.timezone);
    }
    if (input.locale !== undefined) {
      patch.locale = input.locale;
    }
    if (input.currency !== undefined) {
      patch.currency = this.requireCurrency(input.currency);
    }
    if (input.logoUrl !== undefined) {
      patch.logoUrl = input.logoUrl;
    }
    if (input.brandColor !== undefined && input.brandColor !== null) {
      patch.brandColor = this.requireBrandColor(input.brandColor);
    }
    if (input.settings !== undefined) {
      const parsed = OrgSettingsSchema.safeParse(input.settings);
      if (!parsed.success) {
        throw new BadRequestException({
          fieldErrors: { settings: ['Invalid organization settings'] },
        });
      }
      patch.settings = parsed.data as Record<string, unknown>;
    }

    try {
      const updated = await this.organizations.update(organizationId, patch);
      await this.audit.record({
        organizationId,
        actorUserId: actor.userId,
        actorType: 'user',
        action: 'organization.update',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: patch as Record<string, unknown>,
      });
      return this.toPublic(updated);
    } catch (error) {
      throw this.slugConflict(error);
    }
  }

  async softDelete(organizationId: string, actor: OrgActor): Promise<void> {
    if (actor.role !== Role.OWNER) {
      throw new ForbiddenException('Insufficient role');
    }
    await this.organizations.update(organizationId, {
      deletedAt: this.clock.now(),
    });
  }

  async listMembers(
    organizationId: string,
  ): Promise<MemberView[]> {
    const memberships = await this.memberships.listByOrganization(organizationId);
    const views: MemberView[] = [];
    for (const membership of memberships) {
      const user = await this.users.findById(membership.userId);
      views.push({
        id: membership.id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        email: user?.email ?? '',
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
      });
    }
    return views;
  }

  async updateMember(
    organizationId: string,
    targetUserId: string,
    actor: OrgActor,
    input: { role?: 'ADMIN' | 'MEMBER'; status?: 'ACTIVE' | 'DISABLED' },
  ): Promise<MemberView> {
    this.assertCanManageTeam(actor);
    const target = await this.memberships.findByUserInOrganization(
      organizationId,
      targetUserId,
    );
    if (!target) {
      throw new NotFoundException('Not found');
    }
    this.assertCanTouchMember(actor, target);

    const updated = await this.memberships.updateInOrganization(
      organizationId,
      target.id,
      {
        ...(input.role ? { role: input.role as Role } : {}),
        ...(input.status ? { status: input.status as MembershipStatus } : {}),
      },
    );
    const user = await this.users.findById(updated.userId);
    await this.audit.record({
      organizationId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'membership.update',
      resourceType: 'membership',
      resourceId: updated.id,
      metadata: {
        targetUserId,
        role: updated.role,
        status: updated.status,
      },
    });
    return {
      id: updated.id,
      organizationId: updated.organizationId,
      userId: updated.userId,
      email: user?.email ?? '',
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  async removeMember(
    organizationId: string,
    targetUserId: string,
    actor: OrgActor,
  ): Promise<void> {
    this.assertCanManageTeam(actor);
    const target = await this.memberships.findByUserInOrganization(
      organizationId,
      targetUserId,
    );
    if (!target) {
      throw new NotFoundException('Not found');
    }
    this.assertCanTouchMember(actor, target);
    await this.memberships.deleteInOrganization(organizationId, target.id);
  }

  async invite(
    organizationId: string,
    actor: OrgActor,
    input: { email: string; role: 'ADMIN' | 'MEMBER' },
  ): Promise<InvitationView> {
    this.assertCanManageTeam(actor);

    const email = input.email.toLowerCase();
    const existingMemberUser = await this.users.findByEmail(email);
    if (existingMemberUser) {
      const existingMembership = await this.memberships.findByUserInOrganization(
        organizationId,
        existingMemberUser.id,
      );
      if (existingMembership) {
        throw new ConflictException('User is already a member');
      }
    }

    const pending = await this.invitations.findPendingByEmail(
      organizationId,
      email,
    );
    if (pending) {
      if (pending.expiresAt.getTime() > this.clock.now().getTime()) {
        throw new ConflictException(
          'An invitation for this email is already pending',
        );
      }
      await this.invitations.deleteInOrganization(organizationId, pending.id);
    }

    const raw = generateInvitationToken();
    const invitation = await this.transactions.runInTransaction(async () => {
      const created = await this.invitations.create({
        organizationId,
        email,
        role: input.role as Role,
        tokenHash: hashInvitationToken(raw),
        invitedById: actor.userId,
        expiresAt: new Date(this.clock.now().getTime() + INVITATION_TTL_MS),
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.InvitationCreated,
        {
          invitationId: created.id,
          email,
          role: created.role,
          token: raw,
        },
        organizationId,
      );
      return created;
    });

    this.logInviteLink(raw);

    return { ...this.toInvitationView(invitation), token: raw };
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actor: OrgActor,
  ): Promise<void> {
    this.assertCanManageTeam(actor);
    const invitation = await this.invitations.findInOrganization(
      organizationId,
      invitationId,
    );
    if (!invitation) {
      throw new NotFoundException('Not found');
    }
    await this.invitations.deleteInOrganization(organizationId, invitationId);
  }

  async acceptInvitation(
    rawToken: string,
    user: PublicUser,
  ): Promise<MemberView> {
    const invitation = await this.invitations.findByTokenHash(
      hashInvitationToken(rawToken),
    );
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw new BadRequestException({
        message: 'Invalid or expired invitation',
      });
    }

    if (invitation.email !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invitation email does not match');
    }

    const organization = await this.organizations.findActiveById(
      invitation.organizationId,
    );
    if (!organization) {
      throw new NotFoundException('Not found');
    }

    const existing = await this.memberships.findByUserInOrganization(
      invitation.organizationId,
      user.id,
    );
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    return this.transactions.runInTransaction(async () => {
      const membership = await this.memberships.create({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
        status: MembershipStatus.ACTIVE,
      });
      await this.invitations.update(invitation.id, {
        acceptedAt: this.clock.now(),
      });
      return {
        id: membership.id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        email: user.email,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
      };
    });
  }

  async requireActiveMembership(
    organizationId: string,
    userId: string,
  ): Promise<Membership> {
    const membership = await this.memberships.findByUserInOrganization(
      organizationId,
      userId,
    );
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Not found');
    }
    const organization = await this.organizations.findActiveById(organizationId);
    if (!organization) {
      throw new NotFoundException('Not found');
    }
    return membership;
  }

  async findPublicById(
    organizationId: string,
  ): Promise<PublicOrganization | null> {
    const organization = await this.organizations.findActiveById(organizationId);
    return organization ? this.toPublic(organization) : null;
  }

  toPublic(organization: Organization): PublicOrganization {
    const { deletedAt: _deletedAt, ...rest } = organization;
    return rest;
  }

  private async createDefaultScheduleIfAvailable(
    organizationId: string,
    hostUserId: string,
    timezone: string,
  ): Promise<void> {
    await this.schedules.createDefaultSchedule(
      organizationId,
      hostUserId,
      timezone,
    );
  }

  private async allocateSlug(base: string): Promise<string> {
    if (!(await this.organizations.findBySlug(base))) {
      return base;
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = withSlugSuffix(base, randomBytes(2).toString('hex'));
      if (!(await this.organizations.findBySlug(candidate))) {
        return candidate;
      }
    }
    throw new ConflictException({
      code: 'SLUG_TAKEN',
      message: 'Slug is already taken',
    });
  }

  private requireTimeZone(timezone: string): string {
    if (timezone !== 'UTC' && !isValidTimeZone(timezone)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Invalid IANA timezone',
        fieldErrors: { timezone: ['Invalid IANA timezone'] },
      });
    }
    return timezone;
  }

  private requireCurrency(currency: string): string {
    const normalized = currency.toUpperCase();
    if (!CURRENCY_PATTERN.test(normalized)) {
      throw new BadRequestException({
        fieldErrors: { currency: ['Currency must be a 3-letter ISO code'] },
      });
    }
    return normalized;
  }

  private requireSlug(slug: string): string {
    if (!SLUG_PATTERN.test(slug)) {
      throw new BadRequestException({
        fieldErrors: { slug: ['Slug must be lowercase letters, numbers, and hyphens'] },
      });
    }
    return slug;
  }

  private requireBrandColor(color: string): string {
    if (!BRAND_COLOR_PATTERN.test(color)) {
      throw new BadRequestException({
        fieldErrors: { brandColor: ['Brand color must be #RRGGBB'] },
      });
    }
    return color;
  }

  private slugConflict(error: unknown): unknown {
    if (error instanceof UniqueConstraintError) {
      return new ConflictException({
        code: 'SLUG_TAKEN',
        message: 'Slug is already taken',
      });
    }
    return error;
  }

  private assertCanManageTeam(actor: OrgActor): void {
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private assertCanTouchMember(actor: OrgActor, target: Membership): void {
    if (target.role === Role.OWNER) {
      throw new ForbiddenException('Cannot modify an OWNER');
    }
    if (target.userId === actor.userId && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private toInvitationView(invitation: Invitation): InvitationView {
    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  private logInviteLink(rawToken: string): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    const appUrl = this.config
      .getOrThrow<string>('APP_URL')
      .replace(/\/$/, '');
    this.logger.log(`auth.invitation_sent ${appUrl}/invite/${rawToken}`);
  }
}
