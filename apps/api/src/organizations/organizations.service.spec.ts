import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Role } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { InMemoryRepository, TransactionManager } from '../common/persistence';
import { AuditService } from '../audit/audit.service';
import { Outbox } from '../domain-events/outbox';
import { InvitationRepository } from '../invitations/invitation.repository';
import {
  CreateInvitationData,
  Invitation,
  UpdateInvitationData,
} from '../invitations/invitation';
import { MembershipRepository } from '../memberships/membership.repository';
import {
  CreateMembershipData,
  Membership,
  UpdateMembershipData,
} from '../memberships/membership';
import { UsersService } from '../users/users.service';
import { CreateUserData, UpdateUserData, User } from '../users/user';
import { UserRepository } from '../users/user.repository';
import {
  CreateOrganizationData,
  Organization,
  UpdateOrganizationData,
} from './organization';
import { OrganizationRepository } from './organization.repository';
import { OrganizationsService } from './organizations.service';
import { SchedulesService } from '../schedules/schedules.service';

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

class InMemoryOrganizationRepository
  extends InMemoryRepository<
    Organization,
    CreateOrganizationData,
    UpdateOrganizationData
  >
  implements OrganizationRepository
{
  constructor() {
    super('Organization', ['slug']);
  }

  protected buildEntity(
    id: string,
    data: CreateOrganizationData,
  ): Organization {
    const now = new Date();
    return {
      id,
      name: data.name,
      slug: data.slug,
      timezone: data.timezone,
      locale: data.locale,
      currency: data.currency,
      logoUrl: data.logoUrl ?? null,
      brandColor: data.brandColor ?? null,
      platformPlan: 'FREE',
      platformStripeCustomerId: null,
      platformStripeSubscriptionId: null,
      settings: data.settings ?? {},
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.findOneWhere((org) => org.slug === slug && org.deletedAt == null);
  }

  findActiveById(id: string): Promise<Organization | null> {
    return this.findOneWhere((org) => org.id === id && org.deletedAt == null);
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

  async deleteInOrganization(organizationId: string, id: string): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new Error('missing');
    }
    return this.delete(id);
  }
}

class InMemoryInvitationRepository
  extends InMemoryRepository<
    Invitation,
    CreateInvitationData,
    UpdateInvitationData
  >
  implements InvitationRepository
{
  constructor() {
    super('Invitation', ['tokenHash']);
  }

  protected buildEntity(id: string, data: CreateInvitationData): Invitation {
    return {
      id,
      organizationId: data.organizationId,
      email: data.email,
      role: data.role,
      tokenHash: data.tokenHash,
      invitedById: data.invitedById,
      expiresAt: data.expiresAt,
      acceptedAt: null,
      createdAt: new Date(),
    };
  }

  findById(_id: string): Promise<Invitation | null> {
    return Promise.reject(new Error('Invitation lookups require organizationId'));
  }

  findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<Invitation | null> {
    return this.findOneWhere(
      (row) => row.id === id && row.organizationId === organizationId,
    );
  }

  findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return this.findOneWhere((row) => row.tokenHash === tokenHash);
  }

  findPendingByEmail(
    organizationId: string,
    email: string,
  ): Promise<Invitation | null> {
    return this.findOneWhere(
      (row) =>
        row.organizationId === organizationId &&
        row.email === email &&
        row.acceptedAt == null,
    );
  }

  async deleteInOrganization(organizationId: string, id: string): Promise<void> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new Error('missing');
    }
    return this.delete(id);
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

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let users: UsersService;
  const now = new Date('2026-09-11T12:00:00.000Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        UsersService,
        { provide: UserRepository, useClass: InMemoryUserRepository },
        { provide: OrganizationRepository, useClass: InMemoryOrganizationRepository },
        { provide: MembershipRepository, useClass: InMemoryMembershipRepository },
        { provide: InvitationRepository, useClass: InMemoryInvitationRepository },
        { provide: Clock, useValue: new FrozenClock(now) },
        { provide: TransactionManager, useClass: ImmediateTransactionManager },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'http://localhost:3000' },
        },
        {
          provide: Outbox,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SchedulesService,
          useValue: {
            createDefaultSchedule: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(OrganizationsService);
    users = module.get(UsersService);
  });

  async function createUser(email: string): Promise<User> {
    return users.create(email, 'hash');
  }

  it('makes the creator OWNER', async () => {
    const owner = await createUser('owner@example.com');
    const org = await service.create(owner.id, { name: 'Acme' });
    expect(org.slug).toBe('acme');

    const members = await service.listMembers(org.id);
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe(Role.OWNER);
    expect(members[0]?.userId).toBe(owner.id);
  });

  it('lists no organizations for a user without memberships', async () => {
    const user = await createUser('solo@example.com');
    await expect(service.listForUser(user.id)).resolves.toEqual([]);
  });

  it('forbids a MEMBER from changing the slug', async () => {
    const owner = await createUser('owner@example.com');
    const member = await createUser('member@example.com');
    const org = await service.create(owner.id, { name: 'Acme' });
    const invitation = await service.invite(
      org.id,
      { userId: owner.id, role: Role.OWNER },
      { email: member.email, role: 'MEMBER' },
    );
    await service.acceptInvitation(invitation.token!, {
      id: member.id,
      email: member.email,
      createdAt: member.createdAt,
      emailVerifiedAt: null,
    });

    await expect(
      service.update(
        org.id,
        { userId: member.id, role: Role.MEMBER },
        { slug: 'hacked' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an invited ADMIN list members', async () => {
    const owner = await createUser('owner@example.com');
    const admin = await createUser('admin@example.com');
    const org = await service.create(owner.id, { name: 'Acme' });
    const invitation = await service.invite(
      org.id,
      { userId: owner.id, role: Role.OWNER },
      { email: admin.email, role: 'ADMIN' },
    );
    await service.acceptInvitation(invitation.token!, {
      id: admin.id,
      email: admin.email,
      createdAt: admin.createdAt,
      emailVerifiedAt: null,
    });

    const members = await service.listMembers(org.id);
    expect(members.map((item) => item.role).sort()).toEqual(
      [Role.ADMIN, Role.OWNER].sort(),
    );
  });

  it('returns 404 semantics for a user of another org', async () => {
    const ownerA = await createUser('a@example.com');
    const ownerB = await createUser('b@example.com');
    const orgA = await service.create(ownerA.id, { name: 'Alpha' });
    await service.create(ownerB.id, { name: 'Beta' });

    await expect(service.getForMember(orgA.id, ownerB.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a slug that is already taken', async () => {
    const ownerA = await createUser('a@example.com');
    const ownerB = await createUser('b@example.com');
    await service.create(ownerA.id, { name: 'Acme' });
    const orgB = await service.create(ownerB.id, { name: 'Other' });

    await expect(
      service.update(
        orgB.id,
        { userId: ownerB.id, role: Role.OWNER },
        { slug: 'acme' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
