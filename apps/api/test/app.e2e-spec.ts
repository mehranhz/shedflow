import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { TransactionManager } from './../src/common/persistence';
import { UserRepository } from './../src/users/user.repository';
import { SHEDFLOW_VERSION } from '@shedflow/shared';
import { UserTokenType } from '@shedflow/db';
import { hashUserToken } from './../src/user-tokens/user-token.crypto';

config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

function decodeJwt(token: string): {
  typ: string;
  exp: number;
  iat: number;
  orgId?: string;
  role?: string;
} {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) {
    throw new Error('missing JWT payload');
  }
  return JSON.parse(
    Buffer.from(payloadPart, 'base64url').toString('utf8'),
  ) as {
    typ: string;
    exp: number;
    iat: number;
    orgId?: string;
    role?: string;
  };
}

describe('Auth (e2e)', () => {
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

  it('/ (GET) remains public', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /health is public and reports the database', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      db: true,
      version: SHEDFLOW_VERSION,
    });
  });

  it('unauthenticated GET /v1/does-not-exist returns a 401 envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/does-not-exist')
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        details: null,
        requestId: expect.any(String),
      },
    });
    expect(response.headers['x-request-id']).toEqual(
      response.body.error.requestId,
    );
  });

  it('validation errors return VALIDATION_ERROR with field details', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors).toEqual(
      expect.objectContaining({
        email: expect.any(Array),
        password: expect.any(Array),
      }),
    );
  });

  it('registers, rejects unauthenticated /auth/me, then returns the profile', async () => {
    const server = app.getHttpServer();

    const unauthenticated = await request(server).get('/auth/me').expect(401);
    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');

    const register = await request(server)
      .post('/auth/register')
      .send({ email: 'ada@example.com', password: 'password123' })
      .expect(201);

    const registered = register.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string };
    };

    expect(registered.accessToken).toEqual(expect.any(String));
    expect(registered.refreshToken).toEqual(expect.any(String));
    expect(registered.user.email).toBe('ada@example.com');

    const payload = decodeJwt(registered.accessToken);
    expect(payload.typ).toBe('access');
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(payload.orgId).toEqual(expect.any(String));
    expect(payload.role).toBe('OWNER');

    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .expect(200)
      .expect((response) => {
        const profile = response.body as {
          email: string;
          memberships: Array<{ organizationId: string; role: string }>;
          activeOrganization: { id: string; name: string } | null;
        };
        expect(profile.email).toBe('ada@example.com');
        expect(profile).not.toHaveProperty('passwordHash');
        expect(profile.memberships).toHaveLength(1);
        expect(profile.memberships[0]?.organizationId).toBe(payload.orgId);
        expect(profile.memberships[0]?.role).toBe('OWNER');
        expect(profile.activeOrganization?.id).toBe(payload.orgId);
        expect(profile.activeOrganization?.name).toBe("ada's workspace");
      });
  });

  it('logs in with valid credentials', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/register')
      .send({ email: 'grace@example.com', password: 'password123' })
      .expect(201);

    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'grace@example.com', password: 'password123' })
      .expect(201);

    const loggedIn = login.body as { accessToken: string; refreshToken: string };
    expect(loggedIn.accessToken).toEqual(expect.any(String));
    expect(loggedIn.refreshToken).toEqual(expect.any(String));
  });

  it('logs in, refreshes, then authenticates /auth/me with the new access token', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/register')
      .send({ email: 'refresh@example.com', password: 'password123' })
      .expect(201);

    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'refresh@example.com', password: 'password123' })
      .expect(201);

    const loggedIn = login.body as {
      accessToken: string;
      refreshToken: string;
    };

    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.refreshToken })
      .expect(200);

    const rotated = refreshed.body as {
      accessToken: string;
      refreshToken: string;
    };

    expect(rotated.accessToken).not.toBe(loggedIn.accessToken);
    expect(rotated.refreshToken).not.toBe(loggedIn.refreshToken);

    const payload = decodeJwt(rotated.accessToken);
    expect(payload.typ).toBe('access');
    expect(payload.exp - payload.iat).toBe(15 * 60);

    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.email).toBe('refresh@example.com');
      });

    const reuse = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.refreshToken })
      .expect(401);

    expect(reuse.body.error.code).toBe('UNAUTHENTICATED');

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('rolls back repository writes when a transaction fails', async () => {
    const transactions = app.get(TransactionManager);
    const users = app.get(UserRepository);

    await expect(
      transactions.runInTransaction(async () => {
        await users.create({
          email: 'rollback@example.com',
          passwordHash: 'hash',
        });
        expect(await users.findByEmail('rollback@example.com')).not.toBeNull();
        throw new Error('failing after a write');
      }),
    ).rejects.toThrow('failing after a write');

    expect(await users.findByEmail('rollback@example.com')).toBeNull();
  });

  it('forgot-password always returns 204 whether or not the email exists', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(204);

    await request(server)
      .post('/auth/register')
      .send({ email: 'ada@example.com', password: 'password123' })
      .expect(201);

    await request(server)
      .post('/auth/forgot-password')
      .send({ email: 'ada@example.com' })
      .expect(204);
  });

  it('verifies email, then rejects the same token', async () => {
    const server = app.getHttpServer();
    const register = await request(server)
      .post('/auth/register')
      .send({ email: 'verify@example.com', password: 'password123' })
      .expect(201);

    const registered = register.body as {
      accessToken: string;
      user: { id: string; emailVerifiedAt: string | null };
    };
    expect(registered.user.emailVerifiedAt).toBeNull();

    const raw = 'e2e-verify-token';
    await prisma.userToken.create({
      data: {
        userId: registered.user.id,
        type: UserTokenType.EMAIL_VERIFY,
        tokenHash: hashUserToken(raw),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await request(server)
      .post('/auth/verify-email')
      .send({ token: raw })
      .expect(204);

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .expect(200);

    expect(me.body.emailVerifiedAt).toEqual(expect.any(String));

    const reuse = await request(server)
      .post('/auth/verify-email')
      .send({ token: raw })
      .expect(400);
    expect(reuse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('resets the password and rejects the old credentials and reused token', async () => {
    const server = app.getHttpServer();
    const register = await request(server)
      .post('/auth/register')
      .send({ email: 'reset@example.com', password: 'password123' })
      .expect(201);

    const registered = register.body as {
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    };

    const raw = 'e2e-reset-token';
    await prisma.userToken.create({
      data: {
        userId: registered.user.id,
        type: UserTokenType.PASSWORD_RESET,
        tokenHash: hashUserToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await request(server)
      .post('/auth/reset-password')
      .send({ token: raw, password: 'newpass123' })
      .expect(204);

    await request(server)
      .post('/auth/login')
      .send({ email: 'reset@example.com', password: 'password123' })
      .expect(401);

    await request(server)
      .post('/auth/login')
      .send({ email: 'reset@example.com', password: 'newpass123' })
      .expect(201);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: registered.refreshToken })
      .expect(401);

    const reuse = await request(server)
      .post('/auth/reset-password')
      .send({ token: raw, password: 'anotherpass' })
      .expect(400);
    expect(reuse.body.error.code).toBe('VALIDATION_ERROR');
  });
});
