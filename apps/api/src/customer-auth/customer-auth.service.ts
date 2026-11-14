import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { MembershipStatus } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { MembershipRepository } from '../memberships/membership.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type AuthSession } from '../auth/auth.service';
import type { RefreshTokenClientMeta } from '../refresh-tokens/refresh-token';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user';

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export type CustomerBusiness = {
  organizationId: string;
  slug: string;
  name: string;
  customerId: string;
  brandColor: string | null;
  logoUrl: string | null;
  lastBookingAt: string | null;
};

export type CustomerSession = AuthSession & {
  businesses: CustomerBusiness[];
  actorType: 'CUSTOMER';
};

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly memberships: MembershipRepository,
    private readonly clock: Clock,
  ) {}

  async register(
    input: { email: string; password: string; name?: string; timezone?: string },
    meta: RefreshTokenClientMeta,
  ): Promise<CustomerSession> {
    const email = normalizeEmail(input.email);
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email is already registered');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const now = this.clock.now();
    const user = await this.users.create(email, passwordHash, {
      name: input.name?.trim() || null,
      timezone: input.timezone?.trim() || 'UTC',
    });
    await this.users.markEmailVerified(user.id, now);
    await this.linkCustomers(user.id, email);
    const fresh = (await this.users.findById(user.id)) ?? user;
    return this.session(this.users.toPublic(fresh), meta);
  }

  async login(
    email: string,
    password: string,
    meta: RefreshTokenClientMeta,
  ): Promise<CustomerSession> {
    const normalized = normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.emailVerifiedAt) {
      throw new HttpException('Email is not verified', 403);
    }
    const businesses = await this.businessesFor(user.id);
    const memberships = await this.memberships.listByUserId(user.id);
    const staff = memberships.some(
      (membership) => membership.status === MembershipStatus.ACTIVE,
    );
    if (staff && businesses.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.session(this.users.toPublic(user), meta, businesses);
  }

  async requestClaim(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const customers = await this.prisma.customer.count({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    });
    if (customers === 0) {
      return;
    }
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.customerClaimToken.create({
      data: {
        email: normalized,
        tokenHash: sha256(raw),
        expiresAt: new Date(this.clock.now().getTime() + CLAIM_TTL_MS),
      },
    });
    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    this.logger.log(
      `customer claim ${normalized} ${appUrl}/portal/claim?token=${raw}`,
    );
  }

  async confirmClaim(
    token: string,
    meta: RefreshTokenClientMeta,
  ): Promise<CustomerSession> {
    const stored = await this.prisma.customerClaimToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    const now = this.clock.now();
    if (!stored || stored.usedAt || stored.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Invalid or expired claim token');
    }
    await this.prisma.customerClaimToken.update({
      where: { id: stored.id },
      data: { usedAt: now },
    });

    let user = await this.users.findByEmail(stored.email);
    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
      user = await this.users.create(stored.email, passwordHash, { timezone: 'UTC' });
      await this.users.markEmailVerified(user.id, now);
      user = (await this.users.findById(user.id)) ?? user;
    } else if (!user.emailVerifiedAt) {
      user = await this.users.markEmailVerified(user.id, now);
    }
    await this.linkCustomers(user.id, stored.email);
    return this.session(this.users.toPublic(user), meta);
  }

  async profile(userId: string, activeOrgId?: string | null) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const businesses = await this.businessesFor(userId);
    const active =
      businesses.find((item) => item.organizationId === activeOrgId) ?? null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
      },
      businesses,
      activeCustomerOrgId: active?.organizationId ?? null,
      activeCustomerId: active?.customerId ?? null,
    };
  }

  async switchBusiness(user: PublicUser, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { userId: user.id, organizationId },
    });
    if (!customer) {
      throw new HttpException('Customer link not found', 404);
    }
    return {
      accessToken: await this.auth.signCustomerAccess(user, {
        organizationId: customer.organizationId,
        customerId: customer.id,
      }),
      customerOrgId: customer.organizationId,
      customerId: customer.id,
    };
  }

  private async session(
    user: PublicUser,
    meta: RefreshTokenClientMeta,
    businesses?: CustomerBusiness[],
  ): Promise<CustomerSession> {
    const linked = businesses ?? (await this.businessesFor(user.id));
    const first = linked[0];
    const auth = await this.auth.issueCustomerSession(
      user,
      meta,
      first
        ? { organizationId: first.organizationId, customerId: first.customerId }
        : null,
    );
    return { ...auth, businesses: linked, actorType: 'CUSTOMER' };
  }

  private async linkCustomers(userId: string, email: string): Promise<void> {
    await this.prisma.customer.updateMany({
      where: {
        userId: null,
        email: { equals: email, mode: 'insensitive' },
      },
      data: { userId },
    });
  }

  private async businessesFor(userId: string): Promise<CustomerBusiness[]> {
    const rows = await this.prisma.customer.findMany({
      where: { userId },
      include: {
        organization: true,
        bookings: {
          select: { startAt: true },
          orderBy: { startAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      slug: row.organization.slug,
      name: row.organization.name,
      customerId: row.id,
      brandColor: row.organization.brandColor,
      logoUrl: row.organization.logoUrl,
      lastBookingAt: row.bookings[0]?.startAt.toISOString() ?? null,
    }));
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
