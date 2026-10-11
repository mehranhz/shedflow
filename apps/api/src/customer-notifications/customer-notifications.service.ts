import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

/** Default prefs when no row exists (T-057 port for T-075). */
export type EffectiveNotificationPrefs = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  remindersEnabled: boolean;
  marketingEnabled: boolean;
  receiptsEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};

const DEFAULT_PREFS: EffectiveNotificationPrefs = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: false,
  remindersEnabled: true,
  marketingEnabled: false,
  receiptsEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: 'UTC',
};

@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrefs(userId: string): Promise<EffectiveNotificationPrefs> {
    const row = await this.prisma.notificationPreference.findFirst({
      where: { userId, organizationId: null },
    });
    if (!row) return { ...DEFAULT_PREFS };
    return {
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
      pushEnabled: row.pushEnabled,
      remindersEnabled: row.remindersEnabled,
      marketingEnabled: row.marketingEnabled,
      receiptsEnabled: row.receiptsEnabled,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      timezone: row.timezone,
    };
  }

  async updatePrefs(
    userId: string,
    patch: Partial<EffectiveNotificationPrefs>,
  ) {
    const existing = await this.prisma.notificationPreference.findFirst({
      where: { userId, organizationId: null },
    });
    const data = {
      emailEnabled: patch.emailEnabled ?? existing?.emailEnabled ?? true,
      smsEnabled: patch.smsEnabled ?? existing?.smsEnabled ?? false,
      pushEnabled: patch.pushEnabled ?? existing?.pushEnabled ?? false,
      remindersEnabled:
        patch.remindersEnabled ?? existing?.remindersEnabled ?? true,
      marketingEnabled:
        patch.marketingEnabled ?? existing?.marketingEnabled ?? false,
      receiptsEnabled:
        patch.receiptsEnabled ?? existing?.receiptsEnabled ?? true,
      quietHoursStart:
        patch.quietHoursStart !== undefined
          ? patch.quietHoursStart
          : (existing?.quietHoursStart ?? null),
      quietHoursEnd:
        patch.quietHoursEnd !== undefined
          ? patch.quietHoursEnd
          : (existing?.quietHoursEnd ?? null),
      timezone: patch.timezone ?? existing?.timezone ?? 'UTC',
    };
    if (existing) {
      return this.prisma.notificationPreference.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.notificationPreference.create({
      data: { userId, organizationId: null, ...data },
    });
  }

  async optInSms(
    userId: string,
    input: { phone: string; ip?: string; userAgent?: string },
  ) {
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
    await this.updatePrefs(userId, { smsEnabled: true });
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
    if (!process.env.VAPID_PUBLIC_KEY) {
      throw new BadRequestException({
        code: 'PUSH_DISABLED',
        message: 'Web Push is not configured (VAPID_PUBLIC_KEY)',
      });
    }
    return this.prisma.pushSubscription.upsert({
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
  }

  /** Exported for worker preference matrix. */
  static defaults(): EffectiveNotificationPrefs {
    return { ...DEFAULT_PREFS };
  }
}

export { DEFAULT_PREFS };
