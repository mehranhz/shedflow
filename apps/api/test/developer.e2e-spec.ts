import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PlatformPlan } from '@shedflow/db';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Developer API (e2e)', () => {
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
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.booking.deleteMany();
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

  it('gates API key creation on FREE and allows Pro keys for bookings', async () => {
    const { accessToken } = await register('dev@example.com');
    const orgId = decodeJwt(accessToken).orgId!;

    const gated = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'test', scopes: ['bookings:read'] })
      .expect(403);
    expect(gated.body.error.code).toBe('FEATURE_GATED');

    await prisma.organization.update({
      where: { id: orgId },
      data: { platformPlan: PlatformPlan.PRO },
    });

    const created = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'bookings', scopes: ['bookings:read'] })
      .expect(201);

    expect(created.body.secret).toMatch(/^sf_test_/);
    expect(created.body.prefix).toBeTruthy();
    const secret = created.body.secret as string;

    const list = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/bookings`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(200);
    expect(list.body.items ?? list.body).toBeDefined();

    const missing = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/event-types`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(403);
    expect(missing.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects SSRF webhook URLs on create', async () => {
    const { accessToken } = await register('hooks@example.com');
    const orgId = decodeJwt(accessToken).orgId!;
    await prisma.organization.update({
      where: { id: orgId },
      data: { platformPlan: PlatformPlan.PRO },
    });

    const bad = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/webhook-endpoints`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        url: 'http://127.0.0.1:1/',
        events: ['booking.confirmed'],
      });
    expect([400, 422]).toContain(bad.status);

    const privateHttps = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/webhook-endpoints`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        url: 'https://127.0.0.1/hooks',
        events: ['booking.confirmed'],
      })
      .expect(400);
    expect(privateHttps.body.error.message).toMatch(/private|HTTPS|not allowed/i);
  });
});
