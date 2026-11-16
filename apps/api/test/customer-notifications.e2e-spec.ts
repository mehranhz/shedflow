import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { testPhone } from './test-phone';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Customer notification preferences (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.VAPID_PUBLIC_KEY;
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
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('PATCH /v1/customer/notifications/prefs stores an opt-out and audits it', async () => {
    const server = app.getHttpServer();
    const phone = testPhone(`prefs-${Date.now()}`);

    const register = await request(server)
      .post('/v1/customer/auth/register')
      .send({ phone, password: 'password123', name: 'Ada', timezone: 'Asia/Tehran' })
      .expect(201);

    const accessToken = register.body.data.accessToken as string;
    const userId = register.body.data.user.id as string;
    expect(accessToken).toEqual(expect.any(String));

    const initial = await request(server)
      .get('/v1/customer/notifications/prefs')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(initial.body.marketingEnabled).toBe(false);
    expect(initial.body.remindersEnabled).toBe(true);
    expect(initial.body.emailEnabled).toBe(true);
    expect(initial.body.smsEnabled).toBe(false);
    expect(initial.body.pushEnabled).toBe(false);
    expect(initial.body.confirmationsEnabled).toBe(true);
    expect(initial.body.securityEmailsRequired).toBe(true);

    const patched = await request(server)
      .patch('/v1/customer/notifications/prefs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ remindersEnabled: false, timezone: 'Asia/Tehran' })
      .expect(200);

    expect(patched.body.remindersEnabled).toBe(false);
    expect(patched.body.marketingEnabled).toBe(false);
    expect(patched.body.timezone).toBe('Asia/Tehran');
    expect(patched.body.scope).toBe('user');

    const stored = await prisma.notificationPreference.findFirst({
      where: { userId, organizationId: null },
    });
    expect(stored?.remindersEnabled).toBe(false);
    expect(stored?.marketingEnabled).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: userId,
        action: 'notification_preference.update',
      },
    });
    expect(audit?.resourceType).toBe('notification_preference');
    expect(audit?.resourceId).toBe(stored?.id);

    const invalidZone = await request(server)
      .patch('/v1/customer/notifications/prefs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timezone: 'Not/AZone' })
      .expect(400);
    expect(invalidZone.body.error.code).toBe('VALIDATION_ERROR');

    const sms = await request(server)
      .patch('/v1/customer/notifications/prefs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ smsEnabled: true })
      .expect(400);
    expect(sms.body.error.details.fieldErrors.smsEnabled).toEqual(expect.any(Array));
  });
});
