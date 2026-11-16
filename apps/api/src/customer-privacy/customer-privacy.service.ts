import { Injectable, NotFoundException } from '@nestjs/common';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { AuditService } from '../audit/audit.service';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONSENT_PURPOSES,
  type ConsentLog,
  type ConsentPurpose,
} from './consent-log';
import { ConsentLogRepository } from './consent-log.repository';
import { UpdateConsentsDto } from './dto/update-consents.dto';

export type PrivacyContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export type ConsentDecision = {
  granted: boolean;
  consentedAt: string | null;
};

export type LinkedBusiness = {
  organizationId: string;
  slug: string;
  name: string;
  customerId: string;
  brandColor: string | null;
  logoUrl: string | null;
  lastBookingAt: string | null;
};

export type PrivacyOverview = {
  consents: {
    marketingPhone: ConsentDecision;
    marketingOffers: ConsentDecision;
  };
  businesses: LinkedBusiness[];
  links: {
    privacyPolicy: string;
    terms: string;
    export: string;
    deleteAccount: string;
  };
};

const LINKS: PrivacyOverview['links'] = {
  privacyPolicy: '/privacy',
  terms: '/terms',
  export: '/portal/privacy',
  deleteAccount: '/portal/privacy',
};

@Injectable()
export class CustomerPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentLogRepository,
    private readonly audit: AuditService,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async overview(userId: string): Promise<PrivacyOverview> {
    await this.requireUser(userId);
    const [logs, businesses] = await Promise.all([
      this.consents.listForUser(userId),
      this.businessesFor(userId),
    ]);
    return {
      consents: {
        marketingPhone: this.marketingDecision(logs),
        marketingOffers: this.decision(logs, CONSENT_PURPOSES.marketingOffers),
      },
      businesses,
      links: LINKS,
    };
  }

  async updateConsents(
    userId: string,
    dto: UpdateConsentsDto,
    context: PrivacyContext = {},
  ): Promise<PrivacyOverview> {
    const user = await this.requireUser(userId);
    const logs = await this.consents.listForUser(userId);
    const changes = this.diff(logs, dto);
    if (changes.length === 0) {
      return this.overview(userId);
    }

    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      for (const change of changes) {
        const row = await this.consents.create({
          userId,
          organizationId: null,
          purpose: change.purpose,
          granted: change.granted,
          consentedAt: now,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
          source: 'portal',
        });
        await this.audit.record({
          actorUserId: userId,
          actorType: 'user',
          action: 'consent.record',
          resourceType: 'consent_log',
          resourceId: row.id,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
          metadata: {
            purpose: change.purpose,
            granted: change.granted,
            consentedAt: now.toISOString(),
          },
        });
        await this.outbox.emit(
          DOMAIN_EVENTS.CustomerConsentRecorded,
          {
            userId,
            purpose: change.purpose,
            granted: change.granted,
            consentedAt: now.toISOString(),
            consentLogId: row.id,
          },
          null,
        );
        if (change.purpose === CONSENT_PURPOSES.marketingPhone) {
          await this.syncMarketingPreference(userId, change.granted, user.timezone);
        }
      }
    });

    return this.overview(userId);
  }

  /**
   * Clears `Customer.userId` for this organization. The host CRM row and its
   * bookings stay so the business keeps its calendar history.
   */
  async disconnect(
    userId: string,
    organizationId: string,
    context: PrivacyContext = {},
  ): Promise<PrivacyOverview> {
    await this.requireUser(userId);
    await this.transactions.runInTransaction(async () => {
      const customer = await this.prisma.activeClient().customer.findFirst({
        where: { userId, organizationId },
      });
      if (!customer) {
        throw new NotFoundException('Linked business not found');
      }
      await this.prisma.activeClient().customer.update({
        where: { id: customer.id },
        data: { userId: null },
      });
      await this.audit.record({
        organizationId,
        actorUserId: userId,
        actorType: 'user',
        action: 'customer.unlink',
        resourceType: 'customer',
        resourceId: customer.id,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { organizationId, customerId: customer.id },
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerUnlinked,
        {
          userId,
          customerId: customer.id,
          organizationId,
        },
        organizationId,
      );
    });
    return this.overview(userId);
  }

  private diff(
    logs: ConsentLog[],
    dto: UpdateConsentsDto,
  ): Array<{ purpose: ConsentPurpose; granted: boolean }> {
    const changes: Array<{ purpose: ConsentPurpose; granted: boolean }> = [];
    this.pushMarketingChange(changes, logs, dto.marketingPhone);
    this.pushChange(
      changes,
      logs,
      CONSENT_PURPOSES.marketingOffers,
      dto.marketingOffers,
    );
    return changes;
  }

  private pushChange(
    changes: Array<{ purpose: ConsentPurpose; granted: boolean }>,
    logs: ConsentLog[],
    purpose: ConsentPurpose,
    granted: boolean | undefined,
  ): void {
    if (granted === undefined) {
      return;
    }
    if (this.decision(logs, purpose).granted === granted) {
      return;
    }
    changes.push({ purpose, granted });
  }

  private pushMarketingChange(
    changes: Array<{ purpose: ConsentPurpose; granted: boolean }>,
    logs: ConsentLog[],
    granted: boolean | undefined,
  ): void {
    if (granted === undefined) {
      return;
    }
    if (this.marketingDecision(logs).granted === granted) {
      return;
    }
    changes.push({ purpose: CONSENT_PURPOSES.marketingPhone, granted });
  }

  /** Prefer the phone purpose, then an older marketing-email row. */
  private marketingDecision(logs: ConsentLog[]): ConsentDecision {
    const row =
      logs.find((item) => item.purpose === CONSENT_PURPOSES.marketingPhone) ??
      logs.find((item) => item.purpose === CONSENT_PURPOSES.marketingEmail);
    if (!row) {
      return { granted: false, consentedAt: null };
    }
    return {
      granted: row.granted,
      consentedAt: row.consentedAt.toISOString(),
    };
  }

  private decision(logs: ConsentLog[], purpose: string): ConsentDecision {
    const row = logs.find((item) => item.purpose === purpose);
    if (!row) {
      return { granted: false, consentedAt: null };
    }
    return {
      granted: row.granted,
      consentedAt: row.consentedAt.toISOString(),
    };
  }

  private async businessesFor(userId: string): Promise<LinkedBusiness[]> {
    const rows = await this.prisma.activeClient().customer.findMany({
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

  private async syncMarketingPreference(
    userId: string,
    granted: boolean,
    timezone: string,
  ): Promise<void> {
    const client = this.prisma.activeClient();
    const existing = await client.notificationPreference.findFirst({
      where: { userId, organizationId: null },
    });
    if (existing) {
      if (existing.marketingEnabled === granted) {
        return;
      }
      await client.notificationPreference.update({
        where: { id: existing.id },
        data: { marketingEnabled: granted },
      });
      return;
    }
    await client.notificationPreference.create({
      data: {
        userId,
        organizationId: null,
        marketingEnabled: granted,
        timezone: timezone || 'UTC',
      },
    });
  }

  private async requireUser(userId: string): Promise<{ timezone: string }> {
    const user = await this.prisma.activeClient().user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
