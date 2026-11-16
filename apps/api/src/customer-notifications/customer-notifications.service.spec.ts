import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFS,
  emailTemplateCategory,
  notificationAllowed,
} from '@shedflow/shared';
import { AuditService } from '../audit/audit.service';
import { TransactionManager } from '../common/persistence';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { NotificationPreference } from './notification-preference';
import { NotificationPreferenceRepository } from './notification-preference.repository';

describe('notification preference policy', () => {
  it('keeps marketing off and still allows confirmations and security mail', () => {
    expect(DEFAULT_NOTIFICATION_PREFS.marketingEnabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFS.smsEnabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFS.pushEnabled).toBe(false);
    const optedOut = {
      ...DEFAULT_NOTIFICATION_PREFS,
      remindersEnabled: false,
      emailEnabled: false,
    };
    expect(
      notificationAllowed(optedOut, { category: 'confirmation', channel: 'email' }),
    ).toBe(true);
    expect(
      notificationAllowed(optedOut, { category: 'security', channel: 'email' }),
    ).toBe(true);
    expect(
      notificationAllowed(optedOut, { category: 'reminder', channel: 'email' }),
    ).toBe(false);
    expect(
      notificationAllowed(DEFAULT_NOTIFICATION_PREFS, {
        category: 'marketing',
        channel: 'email',
      }),
    ).toBe(false);
    expect(emailTemplateCategory('booking-confirmed-invitee')).toBe('confirmation');
    expect(emailTemplateCategory('reset-password')).toBe('security');
    expect(emailTemplateCategory('reminder-1h-invitee')).toBe('reminder');
    expect(emailTemplateCategory('payment-receipt')).toBe('receipt');
    const quiet = {
      ...DEFAULT_NOTIFICATION_PREFS,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      timezone: 'UTC',
    };
    const night = new Date('2026-01-15T23:30:00.000Z');
    expect(
      notificationAllowed(quiet, { category: 'reminder', channel: 'email', at: night }),
    ).toBe(false);
    expect(
      notificationAllowed(quiet, { category: 'confirmation', channel: 'email', at: night }),
    ).toBe(true);
    expect(
      notificationAllowed(quiet, { category: 'security', channel: 'email', at: night }),
    ).toBe(true);
    expect(
      notificationAllowed(
        { ...DEFAULT_NOTIFICATION_PREFS, receiptsEnabled: false },
        { category: 'receipt', channel: 'email' },
      ),
    ).toBe(false);
  });
});

describe('CustomerNotificationsService', () => {
  const originalTwilio = process.env.TWILIO_ACCOUNT_SID;
  const originalVapid = process.env.VAPID_PUBLIC_KEY;

  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.VAPID_PUBLIC_KEY;
  });

  afterEach(() => {
    restoreEnv('TWILIO_ACCOUNT_SID', originalTwilio);
    restoreEnv('VAPID_PUBLIC_KEY', originalVapid);
  });

  it('returns marketing off when the user has no saved row', async () => {
    const { service } = buildService();
    const view = await service.getPrefs('user-1');
    expect(view.marketingEnabled).toBe(false);
    expect(view.remindersEnabled).toBe(true);
    expect(view.confirmationsEnabled).toBe(true);
    expect(view.securityEmailsRequired).toBe(true);
    expect(view.smsAvailable).toBe(false);
    expect(view.pushAvailable).toBe(false);
    expect(view.scope).toBe('user');
  });

  it('patches reminders off, leaves marketing off, and audits the change', async () => {
    const saved: NotificationPreference = row({
      remindersEnabled: false,
      timezone: 'Asia/Tehran',
    });
    const { service, audit, preferences } = buildService({
      create: jest.fn().mockResolvedValue(saved),
    });

    const view = await service.updatePrefs('user-1', {
      remindersEnabled: false,
      timezone: 'Asia/Tehran',
    });

    expect(view.remindersEnabled).toBe(false);
    expect(view.marketingEnabled).toBe(false);
    expect(view.timezone).toBe('Asia/Tehran');
    expect(preferences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: null,
        remindersEnabled: false,
        marketingEnabled: false,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_preference.update',
        resourceType: 'notification_preference',
        actorUserId: 'user-1',
        metadata: expect.objectContaining({
          changes: expect.objectContaining({
            remindersEnabled: { from: true, to: false },
          }),
        }),
      }),
    );
  });

  it('rejects SMS and an unknown timezone', async () => {
    const { service } = buildService();
    await expect(
      service.updatePrefs('user-1', { smsEnabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updatePrefs('user-1', { timezone: 'Not/AZone' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a linked business for an organization override', async () => {
    const { service } = buildService({
      customer: jest.fn().mockResolvedValue(null),
      membership: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.getPrefs('user-1', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function row(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  const now = new Date('2030-01-01T00:00:00.000Z');
  return {
    id: 'pref-1',
    userId: 'user-1',
    organizationId: null,
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    remindersEnabled: true,
    marketingEnabled: false,
    receiptsEnabled: true,
    waitlistEnabled: true,
    messagesEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'UTC',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildService(options?: {
  create?: jest.Mock;
  customer?: jest.Mock;
  membership?: jest.Mock;
}) {
  const preferences = {
    findForScope: jest.fn().mockResolvedValue(null),
    create: options?.create ?? jest.fn().mockResolvedValue(row()),
    update: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const transactions = {
    runInTransaction: <T>(work: () => Promise<T>) => work(),
    isInTransaction: () => true,
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC', deletedAt: null }),
    },
    customer: { findFirst: options?.customer ?? jest.fn().mockResolvedValue({ id: 'c1' }) },
    membership: { findFirst: options?.membership ?? jest.fn().mockResolvedValue(null) },
  };
  const service = new CustomerNotificationsService(
    prisma as unknown as PrismaService,
    preferences as unknown as NotificationPreferenceRepository,
    audit as unknown as AuditService,
    transactions as unknown as TransactionManager,
  );
  return { service, preferences, audit };
}
