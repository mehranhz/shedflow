import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DOMAIN_EVENTS, isValidTimeZone } from '@shedflow/shared';
import { MembershipStatus, Role, UserTokenType } from '@shedflow/db';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { MembershipRepository } from '../memberships/membership.repository';
import { PublicOrganization } from '../organizations/organization';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService, hashEmail } from '../audit/audit.service';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../users/user';
import { UsersService } from '../users/users.service';
import {
  ACCESS_TOKEN_TTL,
  ACCESS_TOKEN_TYPE,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';
import { RegisterDto } from './dto/register.dto';
import {
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.crypto';
import {
  RefreshToken,
  RefreshTokenClientMeta,
} from '../refresh-tokens/refresh-token';
import { RefreshTokenRepository } from '../refresh-tokens/refresh-token.repository';
import {
  generateUserToken,
  hashUserToken,
} from '../user-tokens/user-token.crypto';
import { UserToken } from '../user-tokens/user-token';
import { UserTokenRepository } from '../user-tokens/user-token.repository';
import { JwtPayload } from './types/jwt-payload';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

export type AuthMembershipView = {
  organizationId: string;
  role: Role;
  status: MembershipStatus;
};

export type AuthProfile = PublicUser & {
  memberships: AuthMembershipView[];
  activeOrganization: PublicOrganization | null;
  /** Present when the access token is a platform impersonation session. */
  impersonatingOrgId?: string | null;
};

export type SwitchedAccess = {
  accessToken: string;
  organizationId: string;
  role: Role;
};

const ROLE_RANK: Record<Role, number> = {
  [Role.OWNER]: 0,
  [Role.ADMIN]: 1,
  [Role.MEMBER]: 2,
};

export function syntheticEmailForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '') || 'user';
  return `phone.${digits}@users.shedflow.invalid`;
}

export function defaultWorkspaceName(identity: string, name?: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return `${trimmed}'s workspace`;
  }
  if (!identity.includes('@')) {
    return 'My workspace';
  }
  const local = identity.split('@')[0]?.trim();
  return `${local && local.length > 0 ? local : 'user'}'s workspace`;
}

/** Drop the hidden mailbox before a user object leaves the API. */
export function presentUser<T extends { email?: string }>(user: T): Omit<T, 'email'> {
  const { email: _hidden, ...visible } = user;
  return visible;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly userTokens: UserTokenRepository,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => OrganizationsService))
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipRepository,
    private readonly outbox: Outbox,
    private readonly audit: AuditService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
  ) {}

  async register(
    dto: RegisterDto,
    meta: RefreshTokenClientMeta = {},
  ): Promise<AuthSession> {
    const phone = dto.username?.trim() ?? '';
    if (!phone || phone.includes('@')) {
      throw new BadRequestException('Phone is required');
    }
    return this.registerWithPhone(phone, dto, meta);
  }

  private async registerWithPhone(
    phone: string,
    dto: RegisterDto,
    meta: RefreshTokenClientMeta,
  ): Promise<AuthSession> {
    const existing = await this.usersService.findByPhone(phone);
    if (existing) {
      throw new ConflictException('Phone is already registered');
    }
    const timezone = this.requireTimeZone(dto.timezone);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const name = dto.name?.trim();
    const email = syntheticEmailForPhone(phone);
    const organizationName =
      dto.organizationName?.trim() || defaultWorkspaceName(phone, name);
    const now = this.clock.now();

    return this.transactions.runInTransaction(async () => {
      const user = await this.usersService.create(email, passwordHash, {
        name: name || null,
        timezone,
        phone,
        phoneVerifiedAt: now,
      });
      await this.usersService.markEmailVerified(user.id, now);
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'user',
        action: 'auth.register',
        resourceType: 'user',
        resourceId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      const organization = await this.organizations.create(user.id, {
        name: organizationName,
        timezone,
      });
      const verified = await this.usersService.findById(user.id);
      return this.issueSession(
        this.usersService.toPublic(verified ?? user),
        meta,
        { organizationId: organization.id, role: Role.OWNER },
      );
    });
  }

  async login(
    user: PublicUser,
    meta: RefreshTokenClientMeta = {},
  ): Promise<AuthSession> {
    const session = await this.issueSession(user, meta);
    await this.audit.record({
      actorUserId: user.id,
      actorType: 'user',
      action: 'auth.login.success',
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return session;
  }

  async refresh(
    rawToken: string,
    meta: RefreshTokenClientMeta = {},
    organizationId?: string,
  ): Promise<AuthSession> {
    const existing = await this.refreshTokens.findByTokenHash(
      hashRefreshToken(rawToken),
    );
    if (!existing) {
      throw this.invalidRefresh();
    }

    const now = this.clock.now();
    if (existing.revokedAt) {
      await this.refreshTokens.revokeAllForUser(existing.userId, now);
      throw this.invalidRefresh();
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      throw this.invalidRefresh();
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw this.invalidRefresh();
    }

    return this.transactions.runInTransaction(async () => {
      const next = await this.createRefreshToken(user.id, meta);
      await this.refreshTokens.update(existing.id, {
        revokedAt: now,
        replacedById: next.id,
      });
      const publicUser = this.usersService.toPublic(user);
      if (organizationId && this.prisma) {
        const membership = await this.memberships.findByUserInOrganization(
          organizationId,
          user.id,
        );
        const staff =
          membership?.status === MembershipStatus.ACTIVE;
        if (!staff) {
          const customer = await this.prisma.customer.findFirst({
            where: { userId: user.id, organizationId },
          });
          if (customer) {
            return {
              accessToken: await this.signAccessToken(
                user.id,
                user.email,
                undefined,
                undefined,
                undefined,
                {
                  actorType: 'CUSTOMER',
                  customerOrgId: customer.organizationId,
                  customerId: customer.id,
                  phone: publicUser.phone,
                  sessionId: next.id,
                },
              ),
              refreshToken: next.raw,
              user: presentUser(publicUser),
            };
          }
        }
      }
      return this.toSession(publicUser, next.raw, organizationId, undefined, next.id);
    });
  }

  async logout(userId: string, rawToken?: string): Promise<void> {
    if (!rawToken) {
      throw new BadRequestException({
        fieldErrors: {
          refreshToken: ['Refresh token is required'],
        },
      });
    }

    const existing = await this.refreshTokens.findByTokenHash(
      hashRefreshToken(rawToken),
    );
    if (!existing) {
      return;
    }
    if (existing.userId !== userId) {
      throw this.invalidRefresh();
    }
    if (existing.revokedAt) {
      return;
    }

    await this.refreshTokens.update(existing.id, {
      revokedAt: this.clock.now(),
    });
  }

  async forgotPassword(phone: string): Promise<void> {
    const user = await this.usersService.findByPhone(phone.trim());
    if (!user) {
      return;
    }

    await this.transactions.runInTransaction(async () => {
      const issued = await this.issueUserToken(
        user.id,
        UserTokenType.PASSWORD_RESET,
        PASSWORD_RESET_TTL_MS,
      );
      this.logAuthLink(
        DOMAIN_EVENTS.PasswordResetRequested,
        'reset-password',
        issued.raw,
      );
      await this.outbox.emit(DOMAIN_EVENTS.PasswordResetRequested, {
        userId: user.id,
        token: issued.raw,
        email: user.email,
      });
    });
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const token = await this.requireUsableToken(
      rawToken,
      UserTokenType.PASSWORD_RESET,
    );
    const passwordHash = await bcrypt.hash(password, 10);
    const now = this.clock.now();

    await this.transactions.runInTransaction(async () => {
      await this.usersService.setPassword(token.userId, passwordHash);
      await this.userTokens.update(token.id, { usedAt: now });
      await this.refreshTokens.revokeAllForUser(token.userId, now);
    });

    this.logger.log(`${DOMAIN_EVENTS.PasswordReset} user=${token.userId}`);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.requireUsableToken(
      rawToken,
      UserTokenType.EMAIL_VERIFY,
    );
    const now = this.clock.now();

    await this.transactions.runInTransaction(async () => {
      await this.usersService.markEmailVerified(token.userId, now);
      await this.userTokens.update(token.id, { usedAt: now });
    });

    this.logger.log(`${DOMAIN_EVENTS.EmailVerified} user=${token.userId}`);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || user.emailVerifiedAt) {
      return;
    }

    await this.transactions.runInTransaction(async () => {
      const issued = await this.issueUserToken(
        user.id,
        UserTokenType.EMAIL_VERIFY,
        EMAIL_VERIFY_TTL_MS,
      );
      this.logAuthLink(
        DOMAIN_EVENTS.EmailVerificationRequested,
        'verify-email',
        issued.raw,
      );
      await this.outbox.emit(DOMAIN_EVENTS.EmailVerificationRequested, {
        userId: user.id,
        token: issued.raw,
        email: user.email,
      });
    });
  }

  async validateUser(
    identifier: string,
    password: string,
  ): Promise<PublicUser | null> {
    const value = identifier.trim();
    const user = value.includes('@') ? null : await this.usersService.findByPhone(value);
    if (!user || !user.phoneVerifiedAt) {
      await this.audit.record({
        actorType: 'user',
        action: 'auth.login.failure',
        resourceType: 'user',
        metadata: { emailHash: hashEmail(value) },
      });
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      await this.audit.record({
        actorUserId: user.id,
        actorType: 'user',
        action: 'auth.login.failure',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { emailHash: hashEmail(value) },
      });
      return null;
    }

    return presentUser(this.usersService.toPublic(user));
  }

  async getProfile(
    userId: string,
    activeOrgId?: string,
    impersonatingOrgId?: string,
  ): Promise<AuthProfile> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const memberships = await this.memberships.listByUserId(userId);

    if (impersonatingOrgId) {
      const activeOrganization =
        await this.organizations.findPublicById(impersonatingOrgId);
      return presentUser({
        ...this.usersService.toPublic(user),
        memberships: memberships.map((membership) => ({
          organizationId: membership.organizationId,
          role: membership.role,
          status: membership.status,
        })),
        activeOrganization,
        impersonatingOrgId,
      });
    }

    const active = await this.pickActiveMembership(userId, activeOrgId);
    const activeOrganization = active
      ? await this.organizations.findPublicById(active.organizationId)
      : null;

    return presentUser({
      ...this.usersService.toPublic(user),
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
      })),
      activeOrganization,
      impersonatingOrgId: null,
    });
  }

  /** Dashboard profile: organizations carry `id` and a nested membership. */
  async getClientProfile(
    userId: string,
    activeOrgId?: string,
    impersonatingOrgId?: string,
  ) {
    const profile = await this.getProfile(
      userId,
      activeOrgId,
      impersonatingOrgId,
    );
    const orgs = await this.organizations.listForUser(userId);
    const byOrg = new Map(
      profile.memberships.map((membership) => [
        membership.organizationId,
        membership,
      ]),
    );
    const memberships = orgs.map((org) => {
      const membership = byOrg.get(org.id);
      return {
        ...org,
        organizationId: org.id,
        role: membership?.role ?? Role.MEMBER,
        membership: {
          user_id: userId,
          organization_id: org.id,
          type: membership?.role ?? Role.MEMBER,
          status: membership?.status ?? MembershipStatus.ACTIVE,
        },
      };
    });
    if (
      profile.activeOrganization &&
      !memberships.some((item) => item.id === profile.activeOrganization!.id)
    ) {
      memberships.unshift({
        ...profile.activeOrganization,
        organizationId: profile.activeOrganization.id,
        role: Role.ADMIN,
        membership: {
          user_id: userId,
          organization_id: profile.activeOrganization.id,
          type: Role.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      });
    }
    return {
      id: profile.id,
      name: profile.name ?? '',
      phone: profile.phone ?? '',
      createdAt: profile.createdAt,
      phoneVerifiedAt: profile.phoneVerifiedAt ?? null,
      memberships,
      activeOrganization: profile.activeOrganization,
      impersonatingOrgId: profile.impersonatingOrgId ?? null,
    };
  }

  issueAccessForOrganization(
    user: PublicUser,
    organizationId: string,
    role: Role,
  ): Promise<SwitchedAccess> {
    return this.signAccessToken(user.id, user.email, organizationId, role).then(
      (accessToken) => ({
        accessToken,
        organizationId,
        role,
      }),
    );
  }

  issueImpersonationAccess(
    user: PublicUser,
    organizationId: string,
  ): Promise<string> {
    return this.signAccessToken(
      user.id,
      user.email,
      organizationId,
      Role.ADMIN,
      organizationId,
    );
  }

  issueAccessWithoutOrg(user: PublicUser): Promise<string> {
    return this.signAccessToken(user.id, user.email, undefined, undefined, undefined, {
      phone: user.phone,
    });
  }

  /** Customer-portal session: no staff org claim. */
  async issueCustomerSession(
    user: PublicUser,
    meta: RefreshTokenClientMeta,
    customer?: { organizationId: string; customerId: string } | null,
  ): Promise<AuthSession> {
    const issued = await this.createRefreshToken(user.id, meta);
    return {
      accessToken: await this.signCustomerAccess(user, customer, issued.id),
      refreshToken: issued.raw,
      user: presentUser(user),
    };
  }

  signCustomerAccess(
    user: PublicUser,
    customer?: { organizationId: string; customerId: string } | null,
    sessionId?: string,
  ): Promise<string> {
    return this.signAccessToken(
      user.id,
      user.email,
      undefined,
      undefined,
      undefined,
      {
        actorType: 'CUSTOMER',
        customerOrgId: customer?.organizationId,
        customerId: customer?.customerId,
        phone: user.phone,
        sessionId,
      },
    );
  }

  private async issueSession(
    user: PublicUser,
    meta: RefreshTokenClientMeta,
    membership?: { organizationId: string; role: Role },
  ): Promise<AuthSession> {
    const issued = await this.createRefreshToken(user.id, meta);
    return this.toSession(user, issued.raw, undefined, membership, issued.id);
  }

  private async toSession(
    user: PublicUser,
    refreshToken: string,
    preferredOrgId?: string,
    membership?: { organizationId: string; role: Role },
    sessionId?: string,
  ): Promise<AuthSession> {
    const active =
      membership ?? (await this.pickActiveMembership(user.id, preferredOrgId));
    return {
      accessToken: await this.signAccessToken(
        user.id,
        user.email,
        active?.organizationId,
        active?.role,
        undefined,
        { phone: user.phone, sessionId },
      ),
      refreshToken,
      user: presentUser(user),
    };
  }

  private async createRefreshToken(
    userId: string,
    meta: RefreshTokenClientMeta,
  ): Promise<{ raw: string; id: string; entity: RefreshToken }> {
    const raw = generateRefreshToken();
    const entity = await this.refreshTokens.create({
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(this.clock.now().getTime() + REFRESH_TOKEN_TTL_MS),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      lastUsedAt: this.clock.now(),
    });
    return { raw, id: entity.id, entity };
  }

  private async issueUserToken(
    userId: string,
    type: UserTokenType,
    ttlMs: number,
  ): Promise<{ raw: string; entity: UserToken }> {
    const raw = generateUserToken();
    const entity = await this.userTokens.create({
      userId,
      type,
      tokenHash: hashUserToken(raw),
      expiresAt: new Date(this.clock.now().getTime() + ttlMs),
    });
    return { raw, entity };
  }

  private async requireUsableToken(
    rawToken: string,
    type: UserTokenType,
  ): Promise<UserToken> {
    const found = await this.userTokens.findByTokenHash(
      hashUserToken(rawToken),
    );
    if (!found || found.type !== type) {
      throw this.invalidUserToken();
    }
    if (found.usedAt) {
      throw new BadRequestException({
        message: 'This token has already been used',
      });
    }
    if (found.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw this.invalidUserToken();
    }
    return found;
  }

  private signAccessToken(
    userId: string,
    email?: string,
    orgId?: string,
    role?: Role,
    impersonatingOrgId?: string,
    extras?: {
      actorType?: 'STAFF' | 'CUSTOMER';
      customerOrgId?: string;
      customerId?: string;
      phone?: string | null;
      sessionId?: string;
    },
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      email: email ?? '',
      typ: ACCESS_TOKEN_TYPE,
      ...(orgId && role ? { orgId, role } : {}),
      ...(impersonatingOrgId ? { impersonatingOrgId } : {}),
      ...(extras?.phone ? { phone: extras.phone } : {}),
      ...(extras?.actorType ? { actorType: extras.actorType } : {}),
      ...(extras?.customerOrgId ? { customerOrgId: extras.customerOrgId } : {}),
      ...(extras?.customerId ? { customerId: extras.customerId } : {}),
      ...(extras?.sessionId ? { sid: extras.sessionId } : {}),
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
      jwtid: randomUUID(),
    });
  }

  private async pickActiveMembership(
    userId: string,
    preferredOrgId?: string,
  ): Promise<{ organizationId: string; role: Role } | undefined> {
    const memberships = (await this.memberships.listByUserId(userId)).filter(
      (membership) => membership.status === MembershipStatus.ACTIVE,
    );
    if (preferredOrgId) {
      const preferred = memberships.find(
        (membership) => membership.organizationId === preferredOrgId,
      );
      if (preferred) {
        return {
          organizationId: preferred.organizationId,
          role: preferred.role,
        };
      }
    }

    const chosen = [...memberships].sort(
      (left, right) => ROLE_RANK[left.role] - ROLE_RANK[right.role],
    )[0];
    return chosen
      ? { organizationId: chosen.organizationId, role: chosen.role }
      : undefined;
  }

  private requireTimeZone(timezone?: string): string {
    const value = timezone?.trim() || 'UTC';
    if (value !== 'UTC' && !isValidTimeZone(value)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Invalid IANA timezone',
        fieldErrors: { timezone: ['Invalid IANA timezone'] },
      });
    }
    return value;
  }

  private logAuthLink(
    event: string,
    path: 'verify-email' | 'reset-password',
    rawToken: string,
  ): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const appUrl = this.config
      .getOrThrow<string>('APP_URL')
      .replace(/\/$/, '');
    this.logger.log(
      `${event} ${appUrl}/${path}?token=${rawToken}`,
    );
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Invalid refresh token',
    });
  }

  private invalidUserToken(): BadRequestException {
    return new BadRequestException({
      message: 'Invalid or expired token',
    });
  }
}
