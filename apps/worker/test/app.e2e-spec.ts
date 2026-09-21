import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  BookingSource,
  BookingStatus,
  DomainEventStatus,
  LocationType,
  MembershipStatus,
  NotificationStatus,
  Role,
} from '@shedflow/db';
import { DOMAIN_EVENTS, EMAIL_TEMPLATES } from '@shedflow/shared';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { LoggingMailer } from './../src/mail/mailer';
import { bookingIcsUid } from './../src/mail/ics';
import { InternalBookingsClient } from './../src/jobs/internal-bookings.client';
import { ReminderService } from './../src/jobs/reminder.service';
import { PgBossService } from './../src/queue/pg-boss.service';
import {
  BOOKING_EXPIRE_QUEUE,
  REMINDER_SEND_QUEUE,
} from './../src/jobs/jobs.constants';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
  onTimeout?: () => Promise<string>,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  const extra = onTimeout ? await onTimeout() : '';
  throw new Error(`timed out waiting for worker${extra ? `: ${extra}` : ''}`);
}

describe('Worker (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: LoggingMailer;
  let reminders: ReminderService;
  let boss: PgBossService;

  beforeAll(async () => {
    process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
    process.env.WORKER_PORT ??= '3003';
    process.env.OUTBOX_BACKOFF_MS = '50';
    process.env.OUTBOX_MAX_ATTEMPTS = '3';
    process.env.OUTBOX_RELAY_INTERVAL_MS = '200';
    process.env.OUTBOX_POLLING_INTERVAL_SECONDS = '0.5';
    process.env.API_URL ??= 'http://localhost:3001';
    delete process.env.RESEND_API_KEY;
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InternalBookingsClient)
      .useFactory({
        factory: (prismaSvc: PrismaService) => ({
          expire: async (bookingId: string) => {
            await prismaSvc.booking.updateMany({
              where: {
                id: bookingId,
                status: BookingStatus.PENDING_PAYMENT,
              },
              data: {
                status: BookingStatus.EXPIRED,
                holdExpiresAt: null,
              },
            });
          },
          confirm: async () => undefined,
        }),
        inject: [PrismaService],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(LoggingMailer);
    reminders = app.get(ReminderService);
    boss = app.get(PgBossService);
  });

  beforeEach(async () => {
    mailer.sent.length = 0;
    await prisma.notificationLog.deleteMany();
    await prisma.domainEvent.deleteMany();
    await prisma.signedActionToken.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.eventType.deleteMany();
    await prisma.availabilityRule.deleteMany();
    await prisma.dateOverride.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.idempotencyKey.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is 200', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.db).toBe(true);
  });

  it('GET /metrics is 200', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(200);
  });

  it('relays a domain_events row to PROCESSED', async () => {
    const created = await prisma.domainEvent.create({
      data: {
        type: 'organization.created',
        payload: { ping: true },
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const row = await prisma.domainEvent.findUnique({
        where: { id: created.id },
      });
      return row?.status === DomainEventStatus.PROCESSED;
    }, 8_000);
  });

  it('marks a poison payload FAILED and keeps serving health', async () => {
    const created = await prisma.domainEvent.create({
      data: {
        type: 'test.poison',
        payload: { poison: true },
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(
      async () => {
        const row = await prisma.domainEvent.findUnique({
          where: { id: created.id },
        });
        return row?.status === DomainEventStatus.FAILED;
      },
      20_000,
      async () => {
        const row = await prisma.domainEvent.findUnique({
          where: { id: created.id },
        });
        return `status=${row?.status} attempts=${row?.attempts} error=${row?.lastError}`;
      },
    );

    const failed = await prisma.domainEvent.findUnique({
      where: { id: created.id },
    });
    expect(failed?.attempts).toBeGreaterThanOrEqual(3);
    expect(failed?.lastError).toContain('poison');

    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('sends host+invitee emails for booking.confirmed without Resend', async () => {
    const booking = await seedBooking(prisma, {
      status: BookingStatus.CONFIRMED,
      startAt: new Date('2030-01-15T15:00:00.000Z'),
    });

    const created = await prisma.domainEvent.create({
      data: {
        type: DOMAIN_EVENTS.BookingConfirmed,
        organizationId: booking.organizationId,
        payload: {
          bookingId: booking.id,
          uid: booking.uid,
          actionTokens: { manage: 'm', cancel: 'c', reschedule: 'r' },
        },
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const row = await prisma.domainEvent.findUnique({ where: { id: created.id } });
      const logs = await prisma.notificationLog.findMany({
        where: { bookingId: booking.id },
      });
      return row?.status === DomainEventStatus.PROCESSED && logs.length >= 2;
    }, 12_000);

    const logs = await prisma.notificationLog.findMany({
      where: { bookingId: booking.id },
      orderBy: { template: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.template).sort()).toEqual([
      EMAIL_TEMPLATES.BookingConfirmedHost,
      EMAIL_TEMPLATES.BookingConfirmedInvitee,
    ]);
    expect(logs.every((log) => log.status === NotificationStatus.SENT)).toBe(true);
    expect(mailer.sent).toHaveLength(2);
    const ics = mailer.sent[0]?.attachments?.[0]?.content.toString('utf8') ?? '';
    expect(ics).toContain(`UID:${bookingIcsUid(booking.uid)}`);
  });

  it('does not insert a second SENT row on duplicate outbox replay', async () => {
    const booking = await seedBooking(prisma, {
      status: BookingStatus.CONFIRMED,
      startAt: new Date('2030-01-15T15:00:00.000Z'),
    });
    const payload = {
      bookingId: booking.id,
      uid: booking.uid,
      actionTokens: { manage: 'm', cancel: 'c', reschedule: 'r' },
    };

    await prisma.domainEvent.create({
      data: {
        type: DOMAIN_EVENTS.BookingConfirmed,
        organizationId: booking.organizationId,
        payload,
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const logs = await prisma.notificationLog.findMany({
        where: { bookingId: booking.id, status: NotificationStatus.SENT },
      });
      return logs.length >= 2;
    }, 12_000);

    const second = await prisma.domainEvent.create({
      data: {
        type: DOMAIN_EVENTS.BookingConfirmed,
        organizationId: booking.organizationId,
        payload,
        status: DomainEventStatus.PENDING,
      },
    });

    await waitFor(async () => {
      const row = await prisma.domainEvent.findUnique({ where: { id: second.id } });
      return row?.status === DomainEventStatus.PROCESSED;
    }, 12_000);

    const logs = await prisma.notificationLog.findMany({
      where: { bookingId: booking.id, status: NotificationStatus.SENT },
    });
    expect(logs).toHaveLength(2);
  });

  it('schedules only 1h reminder when booking starts in 2h', async () => {
    const now = new Date('2030-06-01T12:00:00.000Z');
    const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const booking = await seedBooking(prisma, {
      status: BookingStatus.CONFIRMED,
      startAt,
    });

    const templates = await reminders.scheduleForBooking({
      bookingId: booking.id,
      startAt,
      now,
    });
    expect(templates).toEqual(['reminder-1h']);

    await boss.enqueueJob(
      REMINDER_SEND_QUEUE,
      {
        bookingId: booking.id,
        template: 'reminder-1h',
        startAt: startAt.toISOString(),
      },
      {
        startAfter: new Date(0),
        singletonKey: `reminder:${booking.id}:reminder-1h-run`,
      },
    );

    await waitFor(async () => {
      const logs = await prisma.notificationLog.findMany({
        where: { bookingId: booking.id, template: { startsWith: 'reminder-1h' } },
      });
      return logs.length >= 2;
    }, 12_000);
  });

  it('reminder job no-ops for cancelled bookings', async () => {
    const startAt = new Date('2030-01-15T15:00:00.000Z');
    const booking = await seedBooking(prisma, {
      status: BookingStatus.CANCELLED,
      startAt,
    });

    await reminders.handleSend({
      bookingId: booking.id,
      template: 'reminder-1h',
      startAt: startAt.toISOString(),
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it('expires PENDING_PAYMENT after hold via booking.expire job', async () => {
    const booking = await seedBooking(prisma, {
      status: BookingStatus.PENDING_PAYMENT,
      startAt: new Date('2030-01-15T15:00:00.000Z'),
      holdExpiresAt: new Date(Date.now() - 1000),
    });

    await boss.enqueueJob(
      BOOKING_EXPIRE_QUEUE,
      { bookingId: booking.id },
      { startAfter: new Date(0), singletonKey: `expire:${booking.id}:e2e` },
    );

    await waitFor(async () => {
      const row = await prisma.booking.findUnique({ where: { id: booking.id } });
      return row?.status === BookingStatus.EXPIRED;
    }, 12_000);

    const expired = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(expired?.status).toBe(BookingStatus.EXPIRED);
    expect(expired?.holdExpiresAt).toBeNull();
  });
});

async function seedBooking(
  prisma: PrismaService,
  options: {
    status: BookingStatus;
    startAt: Date;
    holdExpiresAt?: Date | null;
  },
) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const host = await prisma.user.create({
    data: {
      email: `host-${suffix}@example.com`,
      passwordHash: 'hash',
      name: 'Host User',
      timezone: 'UTC',
    },
  });
  const org = await prisma.organization.create({
    data: {
      name: 'Acme',
      slug: `acme-${suffix}`,
      timezone: 'UTC',
    },
  });
  await prisma.membership.create({
    data: {
      organizationId: org.id,
      userId: host.id,
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });
  const schedule = await prisma.schedule.create({
    data: {
      organizationId: org.id,
      hostUserId: host.id,
      name: 'Default',
      timezone: 'UTC',
      isDefault: true,
    },
  });
  const eventType = await prisma.eventType.create({
    data: {
      organizationId: org.id,
      hostUserId: host.id,
      scheduleId: schedule.id,
      slug: 'intro',
      title: 'Intro call',
      durationMinutes: 30,
      locationType: LocationType.LINK,
      locationValue: 'https://meet.example.com/x',
    },
  });
  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      email: `guest-${suffix}@example.com`,
      name: 'Guest User',
    },
  });
  const endAt = new Date(options.startAt.getTime() + 30 * 60 * 1000);
  return prisma.booking.create({
    data: {
      uid: `bk_${suffix}`,
      organizationId: org.id,
      eventTypeId: eventType.id,
      hostUserId: host.id,
      customerId: customer.id,
      startAt: options.startAt,
      endAt,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      timezone: 'UTC',
      status: options.status,
      source: BookingSource.HOSTED,
      locationType: LocationType.LINK,
      locationValue: 'https://meet.example.com/x',
      holdExpiresAt: options.holdExpiresAt ?? null,
    },
  });
}
