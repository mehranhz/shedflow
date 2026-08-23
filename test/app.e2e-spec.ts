import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
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
});
