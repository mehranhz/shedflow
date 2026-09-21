import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
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

export function defaultWorkspaceName(email: string, name?: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return `${trimmed}'s workspace`;
  }
  const local = email.split('@')[0]?.trim();
  return `${local && local.length > 0 ? local : 'user'}'s workspace`;
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
  ) {}

  async register(
    dto: RegisterDto,
    meta: RefreshTokenClientMeta = {},
  ): Promise<AuthSession> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const timezone = this.requireTimeZone(dto.timezone);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const name = dto.name?.trim();
    const organizationName =
      dto.organizationName?.trim() ||
      defaultWorkspaceName(dto.email, name);

    return this.transactions.runInTransaction(async () => {
      const user = await this.usersService.create(dto.email, passwordHash, {
        name: name || null,
        timezone,
      });
      const verify = await this.issueUserToken(
        user.id,
        UserTokenType.EMAIL_VERIFY,
        EMAIL_VERIFY_TTL_MS,
      );
      this.logAuthLink(
        DOMAIN_EVENTS.EmailVerificationRequested,
        'verify-email',
        verify.raw,
      );
      await this.outbox.emit(DOMAIN_EVENTS.EmailVerificationRequested, {
        userId: user.id,
        token: verify.raw,
        email: user.email,
      });
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
      return this.issueSession(this.usersService.toPublic(user), meta, {
        organizationId: organization.id,
        role: Role.OWNER,
      });
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
      return this.toSession(
        this.usersService.toPublic(user),
        next.raw,
        organizationId,
      );
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

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
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
    email: string,
    password: string,
  ): Promise<PublicUser | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await this.audit.record({
        actorType: 'user',
        action: 'auth.login.failure',
        resourceType: 'user',
        metadata: { emailHash: hashEmail(email) },
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
        metadata: { emailHash: hashEmail(email) },
      });
      return null;
    }

    return this.usersService.toPublic(user);
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
      return {
        ...this.usersService.toPublic(user),
        memberships: memberships.map((membership) => ({
          organizationId: membership.organizationId,
          role: membership.role,
          status: membership.status,
        })),
        activeOrganization,
        impersonatingOrgId,
      };
    }

    const active = await this.pickActiveMembership(userId, activeOrgId);
    const activeOrganization = active
      ? await this.organizations.findPublicById(active.organizationId)
      : null;

    return {
      ...this.usersService.toPublic(user),
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
      })),
      activeOrganization,
      impersonatingOrgId: null,
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
    return this.signAccessToken(user.id, user.email);
  }

  private async issueSession(
    user: PublicUser,
    meta: RefreshTokenClientMeta,
    membership?: { organizationId: string; role: Role },
  ): Promise<AuthSession> {
    const issued = await this.createRefreshToken(user.id, meta);
    return this.toSession(user, issued.raw, undefined, membership);
  }

  private async toSession(
    user: PublicUser,
    refreshToken: string,
    preferredOrgId?: string,
    membership?: { organizationId: string; role: Role },
  ): Promise<AuthSession> {
    const active =
      membership ?? (await this.pickActiveMembership(user.id, preferredOrgId));
    return {
      accessToken: await this.signAccessToken(
        user.id,
        user.email,
        active?.organizationId,
        active?.role,
      ),
      refreshToken,
      user,
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
    email: string,
    orgId?: string,
    role?: Role,
    impersonatingOrgId?: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      typ: ACCESS_TOKEN_TYPE,
      ...(orgId && role ? { orgId, role } : {}),
      ...(impersonatingOrgId ? { impersonatingOrgId } : {}),
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
