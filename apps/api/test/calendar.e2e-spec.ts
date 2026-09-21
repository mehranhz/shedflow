import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CalendarProvider } from '@shedflow/db';
import {
  DEV_ENCRYPTION_KEY_BASE64,
  EnvelopeCrypto,
} from '@shedflow/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Google Calendar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
    process.env.API_URL ??= 'http://localhost:3001';
    process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
    process.env.ENCRYPTION_KEY ??= DEV_ENCRYPTION_KEY_BASE64;
    process.env.NODE_ENV = 'test';
    delete process.env.GOOGLE_CLIENT_ID;
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.externalBusyBlock.deleteMany();
    await prisma.connectedCalendar.deleteMany();
    await prisma.calendarConnection.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.signedActionToken.deleteMany();
    await prisma.eventType.deleteMany();
    await prisma.availabilityRule.deleteMany();
    await prisma.dateOverride.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function register(email: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123', timezone: 'UTC' })
      .expect(201);
    return response.body as {
      accessToken: string;
      user: { id: string };
    };
  }

  function decodeJwt(token: string): { orgId?: string; sub?: string } {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      throw new Error('missing JWT payload');
    }
    return JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as { orgId?: string; sub?: string };
  }

  it('removes a public slot when an external busy block overlaps', async () => {
    const { accessToken, user } = await register('calbusy@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    const schedules = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/schedules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const scheduleId = schedules.body[0].id as string;

    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/event-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Intro',
        slug: 'intro',
        durationMinutes: 30,
        locationType: 'LINK',
        scheduleId,
        minNoticeMinutes: 0,
      })
      .expect(201);

    const slotStart = nextWeekdayUtc(1, 10, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    const rangeFrom = new Date(slotStart.getTime() - 24 * 60 * 60 * 1000);
    const rangeTo = new Date(slotStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const before = await request(app.getHttpServer())
      .get(
        `/v1/public/orgs/${org.slug}/event-types/intro/slots?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}&tz=UTC`,
      )
      .expect(200);
    const beforeStarts = (before.body.slots as Array<{ startAt: string }>).map(
      (s) => s.startAt,
    );
    expect(beforeStarts).toContain(slotStart.toISOString());

    const crypto = new EnvelopeCrypto(DEV_ENCRYPTION_KEY_BASE64);
    const connection = await prisma.calendarConnection.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        provider: CalendarProvider.GOOGLE,
        accountEmail: 'host@example.com',
        accessTokenEnc: crypto.encrypt('access-token-never-log'),
        refreshTokenEnc: crypto.encrypt('refresh-token-never-log'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        scopes: ['calendar'],
        lastSyncedAt: new Date(),
        calendars: {
          create: {
            externalId: 'primary',
            name: 'Primary',
            isPrimary: true,
            conflictCheck: true,
            writeTarget: true,
          },
        },
      },
      include: { calendars: true },
    });

    await prisma.externalBusyBlock.create({
      data: {
        connectedCalendarId: connection.calendars[0]!.id,
        hostUserId: user.id,
        startAt: slotStart,
        endAt: slotEnd,
        externalEventId: 'gcal-busy-1',
      },
    });

    const after = await request(app.getHttpServer())
      .get(
        `/v1/public/orgs/${org.slug}/event-types/intro/slots?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}&tz=UTC`,
      )
      .expect(200);
    const afterStarts = (after.body.slots as Array<{ startAt: string }>).map(
      (s) => s.startAt,
    );
    expect(afterStarts).not.toContain(slotStart.toISOString());

    await request(app.getHttpServer())
      .delete(`/v1/organizations/${orgId}/calendar/connections/${connection.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(await prisma.externalBusyBlock.count()).toBe(0);
    expect(await prisma.calendarConnection.count()).toBe(0);
  });

  it('starts Google OAuth with fake provider (no real Google)', async () => {
    const { accessToken } = await register('caloauth@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/calendar/google/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(res.headers.location).toContain('state=');
  });
});

function nextWeekdayUtc(dayOfWeek: number, hour: number, minute: number): Date {
  const now = new Date();
  const result = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ),
  );
  const delta = (dayOfWeek + 7 - result.getUTCDay()) % 7 || 7;
  result.setUTCDate(result.getUTCDate() + delta);
  return result;
}
