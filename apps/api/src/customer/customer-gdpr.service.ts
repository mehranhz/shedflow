import { Injectable, NotFoundException } from '@nestjs/common';
import { DsrRequestStatus, DsrRequestType, MembershipStatus, Prisma } from '@shedflow/db';
import { createHash, randomBytes } from 'node:crypto';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { anonymizedCustomerEmail } from '../customers/customers.service';
import { Outbox } from '../domain-events/outbox';
import { anonymizedUserEmail } from '../me/me.service';
import { MembershipRepository } from '../memberships/membership.repository';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenRepository } from '../refresh-tokens/refresh-token.repository';
import { UserRepository } from '../users/user.repository';
import { UsersService } from '../users/users.service';

/** Booking count above which export is async via outbox + short-TTL download. */
export const CUSTOMER_EXPORT_ASYNC_THRESHOLD = 100;
export const CUSTOMER_EXPORT_DOWNLOAD_TTL_MS = 60 * 60 * 1000;

export type CustomerPortalExportPayload = {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
    locale: string;
  };
  customers: Array<{
    id: string;
    organizationId: string;
    organizationSlug: string | null;
    organizationName: string | null;
    email: string;
    name: string;
    phone: string | null;
    timezone: string | null;
    createdAt: string;
  }>;
  bookings: Array<{
    id: string;
    uid: string;
    organizationId: string;
    startAt: string;
    endAt: string;
    status: string;
    timezone: string;
    paymentId: string | null;
    metadata: Prisma.JsonValue;
    createdAt: string;
  }>;
  consents: {
    privacyAcceptedAt: string | null;
    marketingConsentedAt: string | null;
  };
};

export type ExportResult =
  | { mode: 'sync'; payload: CustomerPortalExportPayload }
  | {
      mode: 'async';
      requestId: string;
      status: 'PENDING';
      message: string;
    };

@Injectable()
export class CustomerGdprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly userRepo: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
  ) {}

  async exportForUser(userId: string): Promise<ExportResult> {
    const payload = await this.buildExportPayload(userId);
    const now = this.clock.now();

    if (payload.bookings.length > CUSTOMER_EXPORT_ASYNC_THRESHOLD) {
      return this.transactions.runInTransaction(async () => {
        const token = randomBytes(32).toString('hex');
        const tokenHash = hashToken(token);
        const request = await this.prisma.activeClient().dsrRequest.create({
          data: {
            userId,
            type: DsrRequestType.EXPORT,
            status: DsrRequestStatus.PENDING,
            requestedAt: now,
            downloadTokenHash: tokenHash,
            downloadExpiresAt: new Date(
              now.getTime() + CUSTOMER_EXPORT_DOWNLOAD_TTL_MS,
            ),
            resultPayload: payload as unknown as Prisma.InputJsonValue,
            metadata: { async: true },
          },
        });
        await this.outbox.emit(
          'customer.dsr.export',
          {
            requestId: request.id,
            userId,
            downloadToken: token,
          },
          null,
        );
        return {
          mode: 'async' as const,
          requestId: request.id,
          status: 'PENDING' as const,
          message:
            'Large export queued. You will receive a short-TTL download link by email.',
        };
      });
    }

    await this.prisma.dsrRequest.create({
      data: {
        userId,
        type: DsrRequestType.EXPORT,
        status: DsrRequestStatus.COMPLETED,
        requestedAt: now,
        completedAt: now,
        metadata: { async: false, bookingCount: payload.bookings.length },
      },
    });

    return { mode: 'sync', payload };
  }

  async getExportRequest(userId: string, requestId: string) {
    const row = await this.prisma.dsrRequest.findFirst({
      where: { id: requestId, userId, type: DsrRequestType.EXPORT },
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
      completedAt: row.completedAt,
      payload:
        row.status === DsrRequestStatus.COMPLETED ? row.resultPayload : null,
    };
  }

  /**
   * Erase portal account: revoke sessions, anonymize User, unlink Customers,
   * anonymize invitee PII while keeping booking time rows (T-034 rules).
   */
  async eraseAccount(userId: string): Promise<void> {
    const existing = await this.users.findById(userId);
    if (!existing) {
      throw new NotFoundException('Not found');
    }
    const now = this.clock.now();

    await this.transactions.runInTransaction(async () => {
      const client = this.prisma.activeClient();

      await client.dsrRequest.create({
        data: {
          userId,
          type: DsrRequestType.ERASE,
          status: DsrRequestStatus.PENDING,
          requestedAt: now,
        },
      });

      const linked = await client.customer.findMany({
        where: { userId },
        select: { id: true, organizationId: true },
      });

      // Also match by email for unlinked historical CRM rows (pre-T-040).
      const user = await client.user.findUnique({ where: { id: userId } });
      const email = user?.email?.trim().toLowerCase();
      const byEmail =
        email && !email.startsWith('deleted+')
          ? await client.customer.findMany({
              where: {
                email: { equals: email, mode: 'insensitive' },
                userId: null,
              },
              select: { id: true, organizationId: true },
            })
          : [];

      const targets = new Map<string, { id: string; organizationId: string }>();
      for (const row of [...linked, ...byEmail]) {
        targets.set(row.id, row);
      }

      for (const customer of targets.values()) {
        await client.booking.updateMany({
          where: {
            organizationId: customer.organizationId,
            customerId: customer.id,
          },
          data: { answers: {} },
        });
        await client.customer.update({
          where: { id: customer.id },
          data: {
            email: anonymizedCustomerEmail(customer.id),
            name: 'Deleted',
            phone: null,
            notes: '',
            userId: null,
          },
        });
      }

      const memberships = await this.memberships.listByUserId(userId);
      const hasActiveStaff = memberships.some(
        (m) => m.status === MembershipStatus.ACTIVE,
      );

      await this.refreshTokens.revokeAllForUser(userId, now);

      if (!hasActiveStaff) {
        // Pure customer: full anonymize (same as DELETE /v1/me).
        await this.memberships.disableAllForUser(userId);
        await this.userRepo.update(userId, {
          email: anonymizedUserEmail(userId),
          name: 'Deleted',
          passwordHash: '!',
          emailVerifiedAt: null,
          deletedAt: now,
        });
      } else {
        // Staff who also booked as customer: unlink only; keep staff login.
        // Refresh already revoked — they re-login as staff.
      }

      await client.dsrRequest.updateMany({
        where: {
          userId,
          type: DsrRequestType.ERASE,
          status: DsrRequestStatus.PENDING,
        },
        data: {
          status: DsrRequestStatus.COMPLETED,
          completedAt: now,
        },
      });

      await this.outbox.emit(
        'customer.dsr.erased',
        { userId, customerIds: [...targets.keys()] },
        null,
      );
    });
  }

  private async buildExportPayload(
    userId: string,
  ): Promise<CustomerPortalExportPayload> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { userId },
          { email: { equals: user.email, mode: 'insensitive' } },
        ],
      },
      include: {
        organization: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const customerIds = customers.map((c) => c.id);
    const bookings =
      customerIds.length === 0
        ? []
        : await this.prisma.booking.findMany({
            where: { customerId: { in: customerIds } },
            orderBy: { startAt: 'asc' },
            take: 5000,
          });

    let privacyAcceptedAt: string | null = null;
    let marketingConsentedAt: string | null = null;
    for (const booking of bookings) {
      const meta = booking.metadata;
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        const record = meta as Record<string, unknown>;
        if (
          typeof record.privacyAcceptedAt === 'string' &&
          !privacyAcceptedAt
        ) {
          privacyAcceptedAt = record.privacyAcceptedAt;
        }
        if (
          typeof record.marketingConsentedAt === 'string' &&
          !marketingConsentedAt
        ) {
          marketingConsentedAt = record.marketingConsentedAt;
        }
      }
    }

    return {
      exportedAt: this.clock.now().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        locale: user.locale,
      },
      customers: customers.map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        organizationSlug: c.organization?.slug ?? null,
        organizationName: c.organization?.name ?? null,
        email: c.email,
        name: c.name,
        phone: c.phone,
        timezone: c.timezone,
        createdAt: c.createdAt.toISOString(),
      })),
      bookings: bookings.map((b) => ({
        id: b.id,
        uid: b.uid,
        organizationId: b.organizationId,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: b.status,
        timezone: b.timezone,
        paymentId: b.paymentId,
        // Staff-only notes are on Customer.notes — omitted from portal export.
        metadata: redactStaffNotes(b.metadata),
        createdAt: b.createdAt.toISOString(),
      })),
      consents: { privacyAcceptedAt, marketingConsentedAt },
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function redactStaffNotes(metadata: Prisma.JsonValue): Prisma.JsonValue {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata;
  }
  const copy = { ...(metadata as Record<string, unknown>) };
  delete copy.staffNotes;
  delete copy.internalNotes;
  return copy as Prisma.JsonValue;
}
