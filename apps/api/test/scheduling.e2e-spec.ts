import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Scheduling (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
    process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
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

  function decodeJwt(token: string): { orgId?: string } {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      throw new Error('missing JWT payload');
    }
    return JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as { orgId?: string };
  }

  it('creates default Mon–Fri schedule on org create', async () => {
    const { accessToken } = await register('sched@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const schedules = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/schedules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(schedules.body).toHaveLength(1);
    expect(schedules.body[0].isDefault).toBe(true);
    expect(schedules.body[0].rules).toHaveLength(5);
    expect(schedules.body[0].rules[0]).toMatchObject({
      startMinute: 540,
      endMinute: 1020,
    });
  });

  it('returns 404 for unknown public routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/public/does-not-exist')
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('creates event type without scheduleId by using/creating default schedule', async () => {
    const { accessToken } = await register('autosched@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });

    // Simulate orgs that never got a default schedule (earlier create bug).
    await prisma.availabilityRule.deleteMany({
      where: { schedule: { organizationId: orgId } },
    });
    await prisma.dateOverride.deleteMany({
      where: { schedule: { organizationId: orgId } },
    });
    await prisma.schedule.deleteMany({ where: { organizationId: orgId } });
    expect(
      await prisma.schedule.count({ where: { organizationId: orgId } }),
    ).toBe(0);

    const created = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/event-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: '30 Minute Meeting',
        slug: '30-minute-meeting',
        durationMinutes: 30,
        locationType: 'GOOGLE_MEET',
      })
      .expect(201);

    expect(created.body.scheduleId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(
      await prisma.schedule.count({ where: { organizationId: orgId } }),
    ).toBe(1);

    const publicOne = await request(app.getHttpServer())
      .get(`/v1/public/orgs/${org.slug}/event-types/30-minute-meeting`)
      .expect(200);
    expect(publicOne.body.slug).toBe('30-minute-meeting');
    expect(publicOne.body.title).toBe('30 Minute Meeting');
  });

  it('serves public event type and rejects 4th FREE event type', async () => {
    const { accessToken } = await register('events@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    const schedules = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/schedules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const scheduleId = schedules.body[0].id as string;

    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/event-types`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: `Call ${i}`,
          slug: `call-${i}`,
          durationMinutes: 30,
          locationType: 'LINK',
          scheduleId,
        })
        .expect(201);
    }

    const gated = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/event-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Call 3',
        slug: 'call-3',
        durationMinutes: 30,
        locationType: 'LINK',
        scheduleId,
      })
      .expect(403);
    expect(gated.body.error.code).toBe('FEATURE_GATED');

    const publicList = await request(app.getHttpServer())
      .get(`/v1/public/orgs/${org.slug}/event-types`)
      .expect(200);
    expect(publicList.body).toHaveLength(3);

    const publicOne = await request(app.getHttpServer())
      .get(`/v1/public/orgs/${org.slug}/event-types/call-0`)
      .expect(200);
    expect(publicOne.body.slug).toBe('call-0');
    expect(publicOne.body.organization.slug).toBe(org.slug);
  });

  it('allows only one of two concurrent public bookings for the same slot', async () => {
    const { accessToken } = await register('book@example.com');
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

    // Next Monday 10:00 UTC
    const startAt = nextWeekdayUtc(1, 10, 0).toISOString();
    const body = {
      orgSlug: org.slug,
      eventTypeSlug: 'intro',
      startAt,
      timezone: 'UTC',
      invitee: { name: 'Ada', email: 'ada@example.com' },
      answers: {},
      source: 'HOSTED',
    };

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/public/bookings')
        .set('Idempotency-Key', randomUUID())
        .send(body),
      request(app.getHttpServer())
        .post('/v1/public/bookings')
        .set('Idempotency-Key', randomUUID())
        .send({
          ...body,
          invitee: { name: 'Grace', email: 'grace@example.com' },
        }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');

    const exclusion = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE conname = 'bookings_host_occupied_excl'
    `;
    expect(exclusion).toHaveLength(1);
  });

  it('cancels with signed token and rejects invalid token', async () => {
    const { accessToken } = await register('cancel@example.com');
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
        cancellationNoticeHours: 0,
      })
      .expect(201);

    const startAt = nextWeekdayUtc(1, 11, 0).toISOString();
    const created = await request(app.getHttpServer())
      .post('/v1/public/bookings')
      .set('Idempotency-Key', randomUUID())
      .send({
        orgSlug: org.slug,
        eventTypeSlug: 'intro',
        startAt,
        timezone: 'UTC',
        invitee: { name: 'Ada', email: 'ada2@example.com' },
        answers: {},
        source: 'HOSTED',
      })
      .expect(201);

    const token = created.body.actionTokens.cancel as string;
    await request(app.getHttpServer())
      .post(`/v1/public/bookings/${created.body.uid}/cancel`)
      .send({ token: 'bad-token' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/v1/public/bookings/${created.body.uid}/cancel`)
      .send({ token })
      .expect(201);
  });

  it('expires pending payment only with valid HMAC', async () => {
    const { accessToken } = await register('expire@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    const schedules = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/schedules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const scheduleId = schedules.body[0].id as string;
    const priceId = randomUUID();

    const eventType = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/event-types`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Paid',
        slug: 'paid',
        durationMinutes: 30,
        locationType: 'LINK',
        scheduleId,
        minNoticeMinutes: 0,
        priceId,
      })
      .expect(201);

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    const startAt = nextWeekdayUtc(2, 10, 0).toISOString();
    const created = await request(app.getHttpServer())
      .post('/v1/public/bookings')
      .set('Idempotency-Key', randomUUID())
      .send({
        orgSlug: org.slug,
        eventTypeSlug: eventType.body.slug,
        startAt,
        timezone: 'UTC',
        invitee: { name: 'Pay', email: 'pay@example.com' },
        answers: {},
        source: 'HOSTED',
      })
      .expect(201);
    expect(created.body.status).toBe('PENDING_PAYMENT');

    await request(app.getHttpServer())
      .post(`/internal/bookings/${created.body.id}/expire`)
      .expect(401);

    const path = `/internal/bookings/${created.body.id}/expire`;
    const timestamp = internalTimestamp();
    const signature = signInternalRequest({
      secret: process.env.INTERNAL_API_SECRET!,
      timestamp,
      method: 'POST',
      path,
      body: '',
    });
    await request(app.getHttpServer())
      .post(path)
      .set(INTERNAL_TIMESTAMP_HEADER, timestamp)
      .set(INTERNAL_SIGNATURE_HEADER, signature)
      .expect(201);
  });
});

function nextWeekdayUtc(dayOfWeek: number, hour: number, minute: number): Date {
  const now = new Date();
  const result = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0),
  );
  const delta = (dayOfWeek + 7 - result.getUTCDay()) % 7 || 7;
  result.setUTCDate(result.getUTCDate() + delta);
  return result;
}
