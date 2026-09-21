import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import {
  BookingSource,
  BookingStatus,
  LocationType,
} from '@shedflow/db';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { anonymizedCustomerEmail } from './../src/customers/customers.service';
import { anonymizedUserEmail } from './../src/me/me.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('GDPR export/erasure (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
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
    await prisma.refreshToken.deleteMany();
    await prisma.membership.deleteMany();
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
      refreshToken: string;
      user: { id: string; email: string };
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

  it('customer delete anonymizes email and keeps booking rows', async () => {
    const session = await register('owner-gdpr@example.com');
    const orgId = decodeJwt(session.accessToken).orgId!;
    const hostId = session.user.id;

    const schedule = await prisma.schedule.create({
      data: {
        organizationId: orgId,
        hostUserId: hostId,
        name: 'Default',
        timezone: 'UTC',
        isDefault: true,
      },
    });
    const eventType = await prisma.eventType.create({
      data: {
        organizationId: orgId,
        hostUserId: hostId,
        scheduleId: schedule.id,
        title: 'Intro',
        slug: 'intro',
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        locationType: LocationType.PHONE,
        questions: [],
      },
    });
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        email: 'invitee@example.com',
        name: 'Invitee',
        phone: '+15551212',
      },
    });
    const startAt = new Date('2030-06-01T10:00:00.000Z');
    const booking = await prisma.booking.create({
      data: {
        uid: `bk_${randomUUID().slice(0, 8)}`,
        organizationId: orgId,
        eventTypeId: eventType.id,
        hostUserId: hostId,
        customerId: customer.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        timezone: 'UTC',
        status: BookingStatus.CONFIRMED,
        source: BookingSource.HOSTED,
        locationType: LocationType.PHONE,
        answers: { q1: 'secret' },
      },
    });

    const exported = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/customers/${customer.id}/export`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(exported.body.customer.email).toBe('invitee@example.com');
    expect(exported.body.bookings).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/v1/organizations/${orgId}/customers/${customer.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(204);

    const anonymized = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(anonymized.email).toBe(anonymizedCustomerEmail(customer.id));
    expect(anonymized.name).toBe('Deleted');
    expect(anonymized.phone).toBeNull();

    const kept = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(kept.startAt.toISOString()).toBe(startAt.toISOString());
    expect(kept.customerId).toBe(customer.id);
    expect(kept.answers).toEqual({});
  });

  it('user delete revokes refresh tokens (cannot refresh)', async () => {
    const session = await register('deleteme@example.com');
    const refreshToken = session.refreshToken;
    expect(refreshToken).toBeTruthy();

    const exported = await request(app.getHttpServer())
      .get('/v1/me/export')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(exported.body.user.email).toBe('deleteme@example.com');

    await request(app.getHttpServer())
      .delete('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    expect(user.deletedAt).not.toBeNull();
    expect(user.email).toBe(anonymizedUserEmail(session.user.id));
    expect(user.name).toBe('Deleted');

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
