import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus, PlatformPlan, Role, UserTokenType } from '@shedflow/db';
import { randomUUID } from 'node:crypto';
import { InMemoryRepository, TransactionManager } from '../common/persistence';
import { Clock } from '../common/clock/clock';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_TTL, ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';
import { hashRefreshToken } from './refresh-token.crypto';
import { UsersService } from '../users/users.service';
import { CreateUserData, UpdateUserData, User } from '../users/user';
import { UserRepository } from '../users/user.repository';
import { MembershipRepository } from '../memberships/membership.repository';
import {
  CreateMembershipData,
  Membership,
  UpdateMembershipData,
} from '../memberships/membership';
import { PublicOrganization } from '../organizations/organization';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../audit/audit.service';
import { Outbox } from '../domain-events/outbox';
import { JwtPayload } from './types/jwt-payload';
import {
  CreateRefreshTokenData,
  RefreshToken,
  UpdateRefreshTokenData,
} from '../refresh-tokens/refresh-token';
import { RefreshTokenRepository } from '../refresh-tokens/refresh-token.repository';
import {
  CreateUserTokenData,
  UpdateUserTokenData,
  UserToken,
} from '../user-tokens/user-token';
import { UserTokenRepository } from '../user-tokens/user-token.repository';
import { hashUserToken } from '../user-tokens/user-token.crypto';

class InMemoryUserRepository
  extends InMemoryRepository<User, CreateUserData, UpdateUserData>
  implements UserRepository
{
  constructor() {
    super('User', ['email']);
  }

  protected buildEntity(id: string, data: CreateUserData): User {
    const now = new Date();
    return {
      id,
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      timezone: data.timezone ?? 'UTC',
      locale: 'en',
      emailVerifiedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(id: string): Promise<User | null> {
    return this.findOneWhere((user) => user.id === id && user.deletedAt == null);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere(
      (user) => user.email === email && user.deletedAt == null,
    );
  }
}

class InMemoryRefreshTokenRepository
  extends InMemoryRepository<
    RefreshToken,
    CreateRefreshTokenData,
    UpdateRefreshTokenData
  >
  implements RefreshTokenRepository
{
  constructor() {
    super('RefreshToken');
  }

  protected buildEntity(
    id: string,
    data: CreateRefreshTokenData,
  ): RefreshToken {
    return {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
      replacedById: null,
      userAgent: data.userAgent ?? null,
      ip: data.ip ?? null,
      createdAt: new Date(),
    };
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.findOneWhere((token) => token.tokenHash === tokenHash);
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const token of this.rows.values()) {
      if (token.userId === userId && token.revokedAt == null) {
        this.rows.set(token.id, { ...token, revokedAt });
      }
    }
  }
}

class InMemoryUserTokenRepository
  extends InMemoryRepository<
    UserToken,
    CreateUserTokenData,
    UpdateUserTokenData
  >
  implements UserTokenRepository
{
  constructor() {
    super('UserToken');
  }

  protected buildEntity(id: string, data: CreateUserTokenData): UserToken {
    return {
      id,
      userId: data.userId,
      type: data.type,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
  }

  findByTokenHash(tokenHash: string): Promise<UserToken | null> {
    return this.findOneWhere((token) => token.tokenHash === tokenHash);
  }
}

class InMemoryMembershipRepository
  extends InMemoryRepository<
    Membership,
    CreateMembershipData,
    UpdateMembershipData
  >
  implements MembershipRepository
{
  constructor() {
    super('Membership');
  }

  protected buildEntity(id: string, data: CreateMembershipData): Membership {
    const now = new Date();
    return {
      id,
      organizationId: data.organizationId,
      userId: data.userId,
      role: data.role,
      status: data.status ?? MembershipStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(_id: string): Promise<Membership | null> {
    return Promise.reject(new Error('Membership lookups require organizationId'));
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Membership | null> {
    return this.findOneWhere(
      (row) => row.id === id && row.organizationId === organizationId,
    );
  }

  findByUserInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Membership | null> {
    return this.findOneWhere(
      (row) => row.organizationId === organizationId && row.userId === userId,
    );
  }

  listByOrganization(organizationId: string): Promise<Membership[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.organizationId === organizationId),
    );
  }

  listByUserId(userId: string): Promise<Membership[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.userId === userId),
    );
  }

  async updateInOrganization(
    organizationId: string,
    id: string,
    data: UpdateMembershipData,
  ): Promise<Membership> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new Error('missing');
    }
    return this.update(id, data);
  }

  async deleteInOrganization(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new Error('missing');
    }
    return this.delete(id);
  }
}

class FakeOrganizationsService {
  readonly created: PublicOrganization[] = [];

  constructor(private readonly memberships: InMemoryMembershipRepository) {}

  async create(
    userId: string,
    input: { name: string; timezone?: string },
  ): Promise<PublicOrganization> {
    const now = new Date();
    const org: PublicOrganization = {
      id: randomUUID(),
      name: input.name,
      slug: 'workspace',
      timezone: input.timezone ?? 'UTC',
      locale: 'en',
      currency: 'USD',
      logoUrl: null,
      brandColor: null,
      platformPlan: PlatformPlan.FREE,
      settings: {},
      createdAt: now,
      updatedAt: now,
    };
    this.created.push(org);
    await this.memberships.create({
      organizationId: org.id,
      userId,
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    });
    return org;
  }

  findPublicById(organizationId: string): Promise<PublicOrganization | null> {
    return Promise.resolve(
      this.created.find((org) => org.id === organizationId) ?? null,
    );
  }
}

class ImmediateTransactionManager extends TransactionManager {
  private depth = 0;

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.depth += 1;
    return Promise.resolve(work()).finally(() => {
      this.depth -= 1;
    });
  }

  isInTransaction(): boolean {
    return this.depth > 0;
  }
}

class FrozenClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }

  now(): Date {
    return new Date(this.instant);
  }
}

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let userTokens: InMemoryUserTokenRepository;
  let memberships: InMemoryMembershipRepository;
  let organizations: FakeOrganizationsService;
  let jwtService: JwtService;
  const now = new Date('2026-09-11T12:00:00.000Z');

  beforeEach(async () => {
    jwtService = new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: ACCESS_TOKEN_TTL },
    });
    refreshTokens = new InMemoryRefreshTokenRepository();
    userTokens = new InMemoryUserTokenRepository();
    memberships = new InMemoryMembershipRepository();
    organizations = new FakeOrganizationsService(memberships);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        { provide: UserRepository, useClass: InMemoryUserRepository },
        { provide: RefreshTokenRepository, useValue: refreshTokens },
        { provide: UserTokenRepository, useValue: userTokens },
        { provide: MembershipRepository, useValue: memberships },
        { provide: OrganizationsService, useValue: organizations },
        { provide: JwtService, useValue: jwtService },
        { provide: Clock, useValue: new FrozenClock(now) },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'http://localhost:3000' },
        },
        {
          provide: TransactionManager,
          useClass: ImmediateTransactionManager,
        },
        {
          provide: Outbox,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
  });

  it('registers a user and returns an access token', async () => {
    const result = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    await expect(
      authService.register({
        email: 'ADA@example.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('translates a unique constraint violation into a ConflictException', async () => {
    await usersService.create('ada@example.com', 'hash');

    await expect(
      usersService.create('ADA@example.com', 'hash'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates credentials', async () => {
    await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    const valid = await authService.validateUser(
      'ada@example.com',
      'password123',
    );
    const invalid = await authService.validateUser(
      'ada@example.com',
      'wrongpass',
    );

    expect(valid?.email).toBe('ada@example.com');
    expect(invalid).toBeNull();
    expect(await usersService.findByEmail('ada@example.com')).not.toBeNull();
  });

  it('issues an access JWT that expires in 15 minutes', async () => {
    const result = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    const payload = jwtService.decode(result.accessToken) as {
      exp: number;
      iat: number;
      typ: string;
    };
    expect(payload.typ).toBe('access');
    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('creates an OWNER workspace and puts orgId on the access JWT', async () => {
    const result = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
      name: 'Ada',
    });

    const payload = jwtService.decode(result.accessToken) as JwtPayload;
    expect(payload.orgId).toEqual(expect.any(String));
    expect(payload.role).toBe(Role.OWNER);

    const profile = await authService.getProfile(result.user.id, payload.orgId);
    expect(profile.memberships).toEqual([
      expect.objectContaining({
        organizationId: payload.orgId,
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    ]);
    expect(profile.activeOrganization?.name).toBe("Ada's workspace");
    expect(profile.activeOrganization?.id).toBe(payload.orgId);
  });

  it('re-issues an access JWT when switching organizations', async () => {
    const session = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });
    const first = jwtService.decode(session.accessToken) as JwtPayload;
    const secondOrgId = randomUUID();
    await memberships.create({
      organizationId: secondOrgId,
      userId: session.user.id,
      role: Role.ADMIN,
      status: MembershipStatus.ACTIVE,
    });

    const switched = await authService.issueAccessForOrganization(
      session.user,
      secondOrgId,
      Role.ADMIN,
    );
    const payload = jwtService.decode(switched.accessToken) as JwtPayload;
    expect(payload.orgId).toBe(secondOrgId);
    expect(payload.role).toBe(Role.ADMIN);
    expect(payload.orgId).not.toBe(first.orgId);
  });

  it('rotates the refresh token and revokes the previous hash', async () => {
    const session = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    const rotated = await authService.refresh(session.refreshToken);

    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(rotated.accessToken).not.toBe(session.accessToken);
    expect(rotated.user.email).toBe('ada@example.com');

    const previous = await refreshTokens.findByTokenHash(
      hashRefreshToken(session.refreshToken),
    );
    const next = await refreshTokens.findByTokenHash(
      hashRefreshToken(rotated.refreshToken),
    );

    expect(previous?.revokedAt).toEqual(now);
    expect(previous?.replacedById).toBe(next?.id);
    expect(next?.revokedAt).toBeNull();
  });

  it('revokes every refresh token for the user when a revoked hash is reused', async () => {
    const first = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });
    const sibling = await authService.login(first.user);
    const rotated = await authService.refresh(first.refreshToken);

    await expect(
      authService.refresh(first.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      authService.refresh(rotated.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authService.refresh(sibling.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const stored = await refreshTokens.findAll({ limit: 50 });
    expect(stored.items).toHaveLength(3);
    expect(stored.items.every((token) => token.revokedAt != null)).toBe(true);
  });

  it('creates a hashed email-verify token on register and leaves the user unverified', async () => {
    const session = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    expect(session.user.emailVerifiedAt).toBeNull();
    const stored = await userTokens.findAll();
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.type).toBe(UserTokenType.EMAIL_VERIFY);
    expect(stored.items[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('forgot-password does not reveal whether the email exists', async () => {
    await expect(
      authService.forgotPassword('missing@example.com'),
    ).resolves.toBeUndefined();

    await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    await expect(
      authService.forgotPassword('ada@example.com'),
    ).resolves.toBeUndefined();
  });

  it('verifies email and rejects token reuse', async () => {
    const session = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });
    const raw = 'verify-raw-token';
    await userTokens.create({
      userId: session.user.id,
      type: UserTokenType.EMAIL_VERIFY,
      tokenHash: hashUserToken(raw),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });

    await authService.verifyEmail(raw);

    const user = await usersService.findById(session.user.id);
    expect(user?.emailVerifiedAt).toEqual(now);

    await expect(authService.verifyEmail(raw)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resets the password, revokes refresh tokens, and rejects reuse', async () => {
    const session = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });
    const raw = 'reset-raw-token';
    await userTokens.create({
      userId: session.user.id,
      type: UserTokenType.PASSWORD_RESET,
      tokenHash: hashUserToken(raw),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    await authService.resetPassword(raw, 'newpass123');

    expect(
      await authService.validateUser('ada@example.com', 'password123'),
    ).toBeNull();
    expect(
      await authService.validateUser('ada@example.com', 'newpass123'),
    ).not.toBeNull();

    await expect(authService.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await expect(
      authService.resetPassword(raw, 'anotherpass'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
