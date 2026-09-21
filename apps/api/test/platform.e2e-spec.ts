import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '@shedflow/db';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Platform flags + impersonation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const previousAdmins = process.env.PLATFORM_ADMINS;
  const previousFlags = process.env.FLAGS;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.APP_URL ??= 'http://localhost:3000';
    process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  });

  afterAll(() => {
    if (previousAdmins === undefined) {
      delete process.env.PLATFORM_ADMINS;
    } else {
      process.env.PLATFORM_ADMINS = previousAdmins;
    }
    if (previousFlags === undefined) {
      delete process.env.FLAGS;
    } else {
      process.env.FLAGS = previousFlags;
    }
  });

  beforeEach(async () => {
    delete process.env.PLATFORM_ADMINS;
    delete process.env.FLAGS;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany();
    await prisma.booking.deleteMany().catch(() => undefined);
    await prisma.eventType.deleteMany().catch(() => undefined);
    await prisma.schedule.deleteMany().catch(() => undefined);
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

  function decodeJwt(token: string): {
    orgId?: string;
    impersonatingOrgId?: string;
    role?: string;
  } {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      throw new Error('missing JWT payload');
    }
    return JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as {
      orgId?: string;
      impersonatingOrgId?: string;
      role?: string;
    };
  }

  it('returns 404 for impersonate when PLATFORM_ADMINS is empty', async () => {
    const { accessToken } = await register('ops@example.com');
    const orgId = decodeJwt(accessToken).orgId!;

    await request(app.getHttpServer())
      .post('/v1/platform/impersonate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationId: orgId })
      .expect(404);
  });

  it('allowlisted admin impersonates another org and writes audit', async () => {
    process.env.PLATFORM_ADMINS = 'ops@example.com';
    await app.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await register('ops@example.com');
    const target = await register('tenant@example.com');
    const targetOrgId = decodeJwt(target.accessToken).orgId!;

    const impersonated = await request(app.getHttpServer())
      .post('/v1/platform/impersonate')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ organizationId: targetOrgId })
      .expect(201);

    expect(impersonated.body.impersonatingOrgId).toBe(targetOrgId);
    const claims = decodeJwt(impersonated.body.accessToken as string);
    expect(claims.impersonatingOrgId).toBe(targetOrgId);
    expect(claims.orgId).toBe(targetOrgId);
    expect(claims.role).toBe(Role.ADMIN);

    const org = await request(app.getHttpServer())
      .get(`/v1/organizations/${targetOrgId}`)
      .set('Authorization', `Bearer ${impersonated.body.accessToken}`)
      .expect(200);
    expect(org.body.id).toBe(targetOrgId);

    const startAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'platform.impersonate',
        organizationId: targetOrgId,
        actorUserId: admin.user.id,
      },
    });
    expect(startAudit).toBeTruthy();

    const requestAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'platform.impersonation.request',
        organizationId: targetOrgId,
        actorUserId: admin.user.id,
      },
    });
    expect(requestAudit).toBeTruthy();
  });

  it('evaluates feature flags from env and org settings', async () => {
    process.env.FLAGS = 'sms';
    await app.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const { accessToken } = await register('flags@example.com');
    const orgId = decodeJwt(accessToken).orgId!;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: { flags: ['outlook_calendar'] },
        platformPlan: 'PRO',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/feature-flags`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.flags.sms).toBe(true);
    expect(response.body.flags.outlook_calendar).toBe(true);
    expect(response.body.flags.embed_v2).toBe(false);
  });
});
