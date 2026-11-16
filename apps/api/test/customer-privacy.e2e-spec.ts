import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BookingSource, BookingStatus, LocationType } from '@shedflow/db';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Customer privacy consent and unlink (e2e)', () => {
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
    await prisma.domainEvent.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.consentLog.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.eventType.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  function decodeJwt(token: string): { orgId?: string } {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      throw new Error('missing JWT payload');
    }
    return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      orgId?: string;
    };
  }

  it('appends consent decisions and unlinks a business without deleting host history', async () => {
    const server = app.getHttpServer();
    const stamp = Date.now();
    const hostEmail = `host-privacy-${stamp}@example.com`;
    const customerEmail = `customer-privacy-${stamp}@example.com`;

    const host = await request(server)
      .post('/auth/register')
      .send({ email: hostEmail, password: 'password123', timezone: 'UTC' })
      .expect(201);
    const orgId = decodeJwt(host.body.accessToken as string).orgId!;
    const hostId = host.body.user.id as string;

    const customer = await request(server)
      .post('/v1/customer/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'Ada',
        timezone: 'Asia/Tehran',
      })
      .expect(201);
    const accessToken = customer.body.data.accessToken as string;
    const userId = customer.body.data.user.id as string;

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
    const linked = await prisma.customer.create({
      data: {
        organizationId: orgId,
        userId,
        email: customerEmail,
        name: 'Ada',
      },
    });
    const startAt = new Date('2030-06-01T10:00:00.000Z');
    const booking = await prisma.booking.create({
      data: {
        uid: `bk_${randomUUID().slice(0, 8)}`,
        organizationId: orgId,
        eventTypeId: eventType.id,
        hostUserId: hostId,
        customerId: linked.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        timezone: 'UTC',
        status: BookingStatus.CONFIRMED,
        source: BookingSource.HOSTED,
        locationType: LocationType.PHONE,
      },
    });

    const initial = await request(server)
      .get('/v1/customer/privacy')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(initial.body.consents.marketingEmail).toEqual({
      granted: false,
      consentedAt: null,
    });
    expect(initial.body.consents.marketingOffers).toEqual({
      granted: false,
      consentedAt: null,
    });
    expect(initial.body.businesses.map((row: { organizationId: string }) => row.organizationId)).toEqual([
      orgId,
    ]);
    expect(initial.body.links.privacyPolicy).toBe('/privacy');
    expect(initial.body.links.terms).toBe('/terms');

    const me = await request(server)
      .get('/v1/customer/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.businesses.map((row: { organizationId: string }) => row.organizationId)).toContain(
      orgId,
    );

    const granted = await request(server)
      .patch('/v1/customer/privacy/consents')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('User-Agent', 'privacy-e2e')
      .send({ marketingEmail: true, marketingOffers: true })
      .expect(200);
    expect(granted.body.consents.marketingEmail.granted).toBe(true);
    expect(granted.body.consents.marketingOffers.granted).toBe(true);
    expect(granted.body.consents.marketingEmail.consentedAt).toEqual(expect.any(String));

    const unchanged = await request(server)
      .patch('/v1/customer/privacy/consents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ marketingEmail: true })
      .expect(200);
    expect(unchanged.body.consents.marketingEmail.consentedAt).toBe(
      granted.body.consents.marketingEmail.consentedAt,
    );

    const revoked = await request(server)
      .patch('/v1/customer/privacy/consents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ marketingEmail: false })
      .expect(200);
    expect(revoked.body.consents.marketingEmail.granted).toBe(false);
    expect(revoked.body.consents.marketingOffers.granted).toBe(true);

    const emailLogs = await prisma.consentLog.findMany({
      where: { userId, purpose: 'marketing_email' },
      orderBy: { consentedAt: 'asc' },
    });
    expect(emailLogs).toHaveLength(2);
    expect(emailLogs[0]?.granted).toBe(true);
    expect(emailLogs[1]?.granted).toBe(false);
    expect(emailLogs[0]?.source).toBe('portal');
    expect(emailLogs[1]?.id).not.toBe(emailLogs[0]?.id);
    await expect(
      prisma.consentLog.update({
        where: { id: emailLogs[0]!.id },
        data: { granted: false },
      }),
    ).rejects.toThrow(/append-only/);

    const offerLogs = await prisma.consentLog.findMany({
      where: { userId, purpose: 'marketing_offers' },
    });
    expect(offerLogs).toHaveLength(1);
    expect(offerLogs[0]?.granted).toBe(true);

    const consentAudits = await prisma.auditLog.findMany({
      where: { actorUserId: userId, action: 'consent.record' },
      orderBy: { createdAt: 'asc' },
    });
    expect(consentAudits).toHaveLength(3);
    expect(consentAudits[0]?.resourceType).toBe('consent_log');
    expect(consentAudits[0]?.resourceId).toBe(emailLogs[0]?.id);

    const consentEvents = await prisma.domainEvent.findMany({
      where: { type: 'customer.consent_recorded' },
    });
    expect(consentEvents).toHaveLength(3);

    const preference = await prisma.notificationPreference.findFirst({
      where: { userId, organizationId: null },
    });
    expect(preference?.marketingEnabled).toBe(false);

    const disconnected = await request(server)
      .post(`/v1/customer/privacy/businesses/${orgId}/disconnect`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(disconnected.body.businesses).toEqual([]);

    const kept = await prisma.customer.findUniqueOrThrow({ where: { id: linked.id } });
    expect(kept.userId).toBeNull();
    expect(kept.organizationId).toBe(orgId);
    expect(kept.email).toBe(customerEmail);
    expect(kept.name).toBe('Ada');

    const keptBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(keptBooking.customerId).toBe(linked.id);
    expect(keptBooking.organizationId).toBe(orgId);
    expect(keptBooking.startAt.toISOString()).toBe(startAt.toISOString());

    const meAfter = await request(server)
      .get('/v1/customer/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meAfter.body.businesses).toEqual([]);

    const unlinkAudit = await prisma.auditLog.findFirst({
      where: { actorUserId: userId, action: 'customer.unlink', resourceId: linked.id },
    });
    expect(unlinkAudit?.organizationId).toBe(orgId);
    expect(unlinkAudit?.resourceType).toBe('customer');

    const unlinkEvent = await prisma.domainEvent.findFirst({
      where: { type: 'customer.unlinked', organizationId: orgId },
    });
    expect(unlinkEvent?.payload).toMatchObject({
      userId,
      customerId: linked.id,
      organizationId: orgId,
    });

    await request(server)
      .post(`/v1/customer/privacy/businesses/${orgId}/disconnect`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
