import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@shedflow/db';
import {
  DEFAULT_NOTIFICATION_PREFS,
  isValidTimeZone,
  mergeNotificationPrefs,
  validateQuietHours,
  type NotificationPrefs,
} from '@shedflow/shared';
import { AuditService } from '../audit/audit.service';
import { TransactionManager } from '../common/persistence';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreference } from './notification-preference';
import { NotificationPreferenceRepository } from './notification-preference.repository';

export type NotificationPrefsView = NotificationPrefs & {
  organizationId: string | null;
  scope: 'user' | 'organization';
  override: boolean;
  smsAvailable: boolean;
  pushAvailable: boolean;
  /** Booking confirmations cannot be turned off. */
  confirmationsEnabled: true;
  /** Password reset and account-claim mail cannot be turned off. */
  securityEmailsRequired: true;
  updatedAt: string | null;
};

export type NotificationPrefsPatch = Partial<NotificationPrefs>;

const ORG_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PREF_KEYS = [
  'emailEnabled',
  'smsEnabled',
  'pushEnabled',
  'remindersEnabled',
  'marketingEnabled',
  'receiptsEnabled',
  'waitlistEnabled',
  'messagesEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'timezone',
] as const satisfies readonly (keyof NotificationPrefs)[];

@Injectable()
export class CustomerNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionManager,
  ) {}

  async getPrefs(
    userId: string,
    organizationId?: string | null,
  ): Promise<NotificationPrefsView> {
    const scope = this.readOrganizationId(organizationId);
    const user = await this.requireUser(userId);
    if (scope) {
      await this.requireLink(userId, scope);
    }
    const globalRow = await this.preferences.findForScope(userId, null);
    const orgRow = scope
      ? await this.preferences.findForScope(userId, scope)
      : null;
    const prefs = mergeNotificationPrefs(globalRow, orgRow);
    if (!globalRow && !orgRow) {
      prefs.timezone = user.timezone || 'UTC';
    }
    return this.toView(prefs, {
      organizationId: scope,
      override: Boolean(orgRow),
      updatedAt: (orgRow ?? globalRow)?.updatedAt ?? null,
    });
  }

  async updatePrefs(
    userId: string,
    patch: NotificationPrefsPatch,
    context?: { organizationId?: string | null; ip?: string; userAgent?: string },
  ): Promise<NotificationPrefsView> {
    const scope = this.readOrganizationId(context?.organizationId);
    const user = await this.requireUser(userId);
    if (scope) {
      await this.requireLink(userId, scope);
    }
    this.assertChannels(patch);
    const quietStart = normalizeQuiet(patch.quietHoursStart);
    const quietEnd = normalizeQuiet(patch.quietHoursEnd);
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
      throw new BadRequestException({
        fieldErrors: { timezone: ['Enter a valid IANA timezone'] },
      });
    }

    const globalRow = await this.preferences.findForScope(userId, null);
    const orgRow = scope
      ? await this.preferences.findForScope(userId, scope)
      : null;
    const before = mergeNotificationPrefs(globalRow, orgRow);
    if (!globalRow && !orgRow) {
      before.timezone = user.timezone || 'UTC';
    }
    const next = applyPatch(before, patch, quietStart, quietEnd);
    const quietErrors = validateQuietHours(next.quietHoursStart, next.quietHoursEnd);
    if (quietErrors) {
      throw new BadRequestException({ fieldErrors: quietErrors });
    }
    if (next.timezone && !isValidTimeZone(next.timezone)) {
      throw new BadRequestException({
        fieldErrors: { timezone: ['Enter a valid IANA timezone'] },
      });
    }

    const changes = diffPrefs(before, next);
    const saved = await this.transactions.runInTransaction(async () => {
      const row = await this.writeScope(userId, scope, next, scope ? orgRow : globalRow);
      if (Object.keys(changes).length > 0) {
        await this.audit.record({
          organizationId: scope,
          actorUserId: userId,
          actorType: 'user',
          action: 'notification_preference.update',
          resourceType: 'notification_preference',
          resourceId: row.id,
          ip: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
          metadata: {
            organizationId: scope,
            changes,
          },
        });
      }
      return row;
    });

    return this.toView(next, {
      organizationId: scope,
      override: Boolean(scope),
      updatedAt: saved.updatedAt,
    });
  }

  async optInSms(
    userId: string,
    input: { phone: string; ip?: string; userAgent?: string },
  ) {
    if (!smsChannelAvailable()) {
      throw new BadRequestException({
        fieldErrors: {
          smsEnabled: ['SMS stays off until Twilio is configured'],
        },
      });
    }
    const phone = input.phone.trim();
    if (phone.length < 7) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Phone required for SMS consent',
      });
    }
    await this.prisma.smsConsent.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const consent = await this.prisma.smsConsent.create({
      data: {
        userId,
        phone,
        consentedAt: new Date(),
        ip: input.ip,
        userAgent: input.userAgent,
        source: 'portal',
      },
    });
    await this.updatePrefs(
      userId,
      { smsEnabled: true },
      { ip: input.ip, userAgent: input.userAgent },
    );
    return consent;
  }

  async revokeSms(userId: string) {
    await this.prisma.smsConsent.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.updatePrefs(userId, { smsEnabled: false });
    return { ok: true as const };
  }

  async activeSmsConsent(userId: string) {
    return this.prisma.smsConsent.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { consentedAt: 'desc' },
    });
  }

  async subscribePush(
    userId: string,
    input: { endpoint: string; p256dh: string; auth: string },
  ) {
    if (!pushChannelAvailable()) {
      throw new BadRequestException({
        fieldErrors: {
          pushEnabled: ['Push stays off until it is configured'],
        },
      });
    }
    const subscription = await this.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: input.endpoint },
      },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
        revokedAt: null,
      },
    });
    await this.updatePrefs(userId, { pushEnabled: true });
    return subscription;
  }

  private async writeScope(
    userId: string,
    organizationId: string | null,
    next: NotificationPrefs,
    existing: NotificationPreference | null,
  ): Promise<NotificationPreference> {
    const data = {
      emailEnabled: next.emailEnabled,
      smsEnabled: next.smsEnabled,
      pushEnabled: next.pushEnabled,
      remindersEnabled: next.remindersEnabled,
      marketingEnabled: next.marketingEnabled,
      receiptsEnabled: next.receiptsEnabled,
      waitlistEnabled: next.waitlistEnabled,
      messagesEnabled: next.messagesEnabled,
      quietHoursStart: next.quietHoursStart,
      quietHoursEnd: next.quietHoursEnd,
      timezone: next.timezone,
    };
    if (existing) {
      return this.preferences.update(existing.id, data);
    }
    return this.preferences.create({
      userId,
      organizationId,
      ...data,
    });
  }

  private toView(
    prefs: NotificationPrefs,
    meta: {
      organizationId: string | null;
      override: boolean;
      updatedAt: Date | null;
    },
  ): NotificationPrefsView {
    return {
      ...prefs,
      organizationId: meta.organizationId,
      scope: meta.organizationId ? 'organization' : 'user',
      override: meta.override,
      smsAvailable: smsChannelAvailable(),
      pushAvailable: pushChannelAvailable(),
      confirmationsEnabled: true,
      securityEmailsRequired: true,
      updatedAt: meta.updatedAt ? meta.updatedAt.toISOString() : null,
    };
  }

  private readOrganizationId(value?: string | null): string | null {
    if (value == null || value === '') {
      return null;
    }
    if (!ORG_ID.test(value)) {
      throw new BadRequestException({
        fieldErrors: { organizationId: ['Invalid organization'] },
      });
    }
    return value;
  }

  private async requireUser(userId: string): Promise<{ timezone: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return user;
  }

  private async requireLink(userId: string, organizationId: string): Promise<void> {
    const [customer, membership] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { userId, organizationId },
        select: { id: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId, organizationId, status: MembershipStatus.ACTIVE },
        select: { id: true },
      }),
    ]);
    if (!customer && !membership) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Business is not linked to this account',
      });
    }
  }

  private assertChannels(patch: NotificationPrefsPatch): void {
    if (patch.smsEnabled === true && !smsChannelAvailable()) {
      throw new BadRequestException({
        fieldErrors: {
          smsEnabled: ['SMS stays off until Twilio is configured'],
        },
      });
    }
    if (patch.pushEnabled === true && !pushChannelAvailable()) {
      throw new BadRequestException({
        fieldErrors: {
          pushEnabled: ['Push stays off until it is configured'],
        },
      });
    }
  }
}

export function smsChannelAvailable(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim());
}

export function pushChannelAvailable(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim());
}

function normalizeQuiet(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function applyPatch(
  before: NotificationPrefs,
  patch: NotificationPrefsPatch,
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined,
): NotificationPrefs {
  return {
    ...before,
    emailEnabled: patch.emailEnabled ?? before.emailEnabled,
    smsEnabled: patch.smsEnabled ?? before.smsEnabled,
    pushEnabled: patch.pushEnabled ?? before.pushEnabled,
    remindersEnabled: patch.remindersEnabled ?? before.remindersEnabled,
    marketingEnabled: patch.marketingEnabled ?? before.marketingEnabled,
    receiptsEnabled: patch.receiptsEnabled ?? before.receiptsEnabled,
    waitlistEnabled: patch.waitlistEnabled ?? before.waitlistEnabled,
    messagesEnabled: patch.messagesEnabled ?? before.messagesEnabled,
    quietHoursStart:
      quietStart !== undefined ? quietStart : before.quietHoursStart,
    quietHoursEnd: quietEnd !== undefined ? quietEnd : before.quietHoursEnd,
    timezone: patch.timezone ?? before.timezone ?? DEFAULT_NOTIFICATION_PREFS.timezone,
  };
}

function diffPrefs(
  before: NotificationPrefs,
  after: NotificationPrefs,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of PREF_KEYS) {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }
  return changes;
}
