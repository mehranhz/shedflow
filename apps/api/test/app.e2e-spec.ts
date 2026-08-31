import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { TransactionManager } from './../src/common/persistence';
import { UserRepository } from './../src/users/user.repository';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    // Redirect the suite at the throwaway database so it never truncates dev data.
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
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

  it('registers, rejects unauthenticated /auth/me, then returns the profile', async () => {
    const server = app.getHttpServer();

    await request(server).get('/auth/me').expect(401);

    const register = await request(server)
      .post('/auth/register')
      .send({ email: 'ada@example.com', password: 'password123' })
      .expect(201);

    const registered = register.body as {
      accessToken: string;
      user: { email: string };
    };

    expect(registered.accessToken).toEqual(expect.any(String));
    expect(registered.user.email).toBe('ada@example.com');

    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .expect(200)
      .expect((response) => {
        const profile = response.body as { email: string };
        expect(profile.email).toBe('ada@example.com');
        expect(profile).not.toHaveProperty('passwordHash');
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

    const loggedIn = login.body as { accessToken: string };
    expect(loggedIn.accessToken).toEqual(expect.any(String));
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
});
