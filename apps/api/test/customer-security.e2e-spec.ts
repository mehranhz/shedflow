import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { totpCode } from './../src/customer-security/totp';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

describe('Customer security TOTP and sessions (e2e)', () => {
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
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires enrolled TOTP on login, spends a backup code once, and revokes one session', async () => {
    const server = app.getHttpServer();
    const email = `security-${Date.now()}@example.com`;
    const password = 'password123';

    const register = await request(server)
      .post('/v1/customer/auth/register')
      .send({ email, password, name: 'Ada' })
      .expect(201);
    const accessToken = register.body.data.accessToken as string;

    const enrolled = await request(server)
      .post('/v1/customer/security/totp/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const secret = enrolled.body.secret as string;
    expect(secret).toEqual(expect.any(String));
    expect(enrolled.body.otpauthUrl).toContain(secret);

    const confirmed = await request(server)
      .post('/v1/customer/security/totp/confirm')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: totpCode(secret) })
      .expect(200);
    const backup = (confirmed.body.backupCodes as string[])[0];
    expect(confirmed.body.backupCodes).toHaveLength(8);

    const challenged = await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password })
      .expect(200);
    expect(challenged.body.data.mfaRequired).toBe(true);
    expect(challenged.body.data.accessToken).toBeUndefined();
    const mfaToken = challenged.body.data.mfaToken as string;

    const signedIn = await request(server)
      .post('/v1/customer/auth/login/totp')
      .send({ mfaToken, code: totpCode(secret) })
      .expect(200);
    expect(signedIn.body.data.accessToken).toEqual(expect.any(String));
    const firstAccess = signedIn.body.data.accessToken as string;
    const firstRefresh = signedIn.body.data.refreshToken as string;

    const withBackup = await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password })
      .expect(200);
    const backupLogin = await request(server)
      .post('/v1/customer/auth/login/totp')
      .send({ mfaToken: withBackup.body.data.mfaToken, code: backup })
      .expect(200);
    const secondRefresh = backupLogin.body.data.refreshToken as string;

    const reused = await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password })
      .expect(200);
    await request(server)
      .post('/v1/customer/auth/login/totp')
      .send({ mfaToken: reused.body.data.mfaToken, code: backup })
      .expect(401);

    const sessions = await request(server)
      .get('/v1/customer/security/sessions')
      .set('Authorization', `Bearer ${firstAccess}`)
      .expect(200);
    const secondId = sessionId(backupLogin.body.data.accessToken as string);
    expect(sessions.body.sessions.map((row: { id: string }) => row.id)).toContain(secondId);

    await request(server)
      .delete(`/v1/customer/security/sessions/${secondId}`)
      .set('Authorization', `Bearer ${firstAccess}`)
      .expect(204);

    const stillValid = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(stillValid.body.refreshToken).toEqual(expect.any(String));

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(401);

    const me = await request(server)
      .get('/v1/customer/me')
      .set('Authorization', `Bearer ${stillValid.body.accessToken}`)
      .expect(200);
    const updatedAt = me.body.user.updatedAt as string;
    const missingCode = await request(server)
      .post('/v1/customer/me/email')
      .set('Authorization', `Bearer ${stillValid.body.accessToken}`)
      .send({ email: 'ada-next@example.com', updatedAt })
      .expect(400);
    expect(missingCode.body.error.details.fieldErrors.totpCode).toEqual(expect.any(Array));

    await request(server)
      .post('/v1/customer/me/email')
      .set('Authorization', `Bearer ${stillValid.body.accessToken}`)
      .send({ email: 'ada-next@example.com', updatedAt, totpCode: totpCode(secret) })
      .expect(202);

    await request(server)
      .post('/v1/customer/security/password')
      .set('Authorization', `Bearer ${stillValid.body.accessToken}`)
      .send({
        currentPassword: password,
        newPassword: 'password456',
        totpCode: totpCode(secret),
      })
      .expect(200);

    await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password })
      .expect(401);
    const nextLogin = await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password: 'password456' })
      .expect(200);
    expect(nextLogin.body.data.mfaRequired).toBe(true);
  });

  it('rate-limits repeated TOTP attempts', async () => {
    const server = app.getHttpServer();
    const email = `limit-${Date.now()}@example.com`;
    const password = 'password123';
    const register = await request(server)
      .post('/v1/customer/auth/register')
      .send({ email, password })
      .expect(201);
    const enrolled = await request(server)
      .post('/v1/customer/security/totp/enroll')
      .set('Authorization', `Bearer ${register.body.data.accessToken}`)
      .expect(200);
    const secret = enrolled.body.secret as string;
    await request(server)
      .post('/v1/customer/security/totp/confirm')
      .set('Authorization', `Bearer ${register.body.data.accessToken}`)
      .send({ code: totpCode(secret) })
      .expect(200);

    const challenged = await request(server)
      .post('/v1/customer/auth/login')
      .send({ email, password })
      .expect(200);
    const mfaToken = challenged.body.data.mfaToken as string;
    const bad = totpCode(secret) === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server)
        .post('/v1/customer/auth/login/totp')
        .send({ mfaToken, code: bad })
        .expect(401);
    }
    const locked = await request(server)
      .post('/v1/customer/auth/login/totp')
      .send({ mfaToken, code: totpCode(secret) })
      .expect(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
    expect(locked.body.error.message).toMatch(/too many authentication attempts/i);
  });
});

function sessionId(accessToken: string): string {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { sid?: string };
  if (!payload.sid) {
    throw new Error('access token is missing sid');
  }
  return payload.sid;
}
