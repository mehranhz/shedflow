import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SHEDFLOW_VERSION } from '@shedflow/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { PaymentGateway } from './payments/payment-gateway';
import { InMemoryPaymentGateway } from './payments/in-memory-payment-gateway';
import { PrismaService } from './prisma/prisma.service';

function applyTestEnv(): void {
  process.env.JWT_SECRET = 'test-jwt-secret-change-me';
  process.env.DATABASE_URL ??=
    'postgresql://shedflow:shedflow@localhost:5434/shedflow_test?schema=public';
  process.env.APP_URL ??= 'http://localhost:3000';
  process.env.BILLING_URL ??= 'http://localhost:3002';
  process.env.BILLING_PORT ??= '3002';
  process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
  process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_placeholder';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET ??= 'whsec_placeholder';
}

describe('Billing app (T-018)', () => {
  let app: INestApplication<App>;
  const prisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: { findUnique: jest.fn() },
    membership: { findUnique: jest.fn() },
  };

  beforeAll(() => {
    applyTestEnv();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useClass(InMemoryPaymentGateway)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      db: true,
      version: SHEDFLOW_VERSION,
    });
  });

  it('invalid JWT returns a 401 envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/billing/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
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

  it('POST /webhooks/stripe without signature returns 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send({ type: 'checkout.session.completed' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toMatch(/signature/i);
  });
});
