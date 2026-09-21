import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus, PlatformPlan, Role } from '@shedflow/db';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { InMemoryPaymentGateway } from '../payments/in-memory-payment-gateway';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformAccountRepository } from './platform-account.repository';
import {
  StripeEventRecord,
  StripeEventRepository,
} from '../stripe-events/stripe-event.repository';

const JWT_SECRET = 'test-jwt-secret-change-me';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function applyTestEnv(): void {
  // Force a known secret so ConfigModule + token signing stay aligned even when
  // a developer .env already exported a different JWT_SECRET into the process.
  process.env.JWT_SECRET = JWT_SECRET;
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

function signAccessToken(orgId = ORG_ID): string {
  const secret = process.env.JWT_SECRET ?? JWT_SECRET;
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      email: 'owner@example.com',
      orgId,
      role: 'OWNER',
      typ: 'access',
      iat: now,
      exp: now + 900,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

class FakePlatformAccounts extends PlatformAccountRepository {
  readonly rows = new Map<
    string,
    {
      organizationId: string;
      stripeAccountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  flagUpdates = 0;

  async findByOrganizationId(organizationId: string) {
    return this.rows.get(organizationId) ?? null;
  }

  async findByStripeAccountId(stripeAccountId: string) {
    return (
      [...this.rows.values()].find(
        (row) => row.stripeAccountId === stripeAccountId,
      ) ?? null
    );
  }

  async create(data: {
    organizationId: string;
    stripeAccountId: string;
  }) {
    const now = new Date();
    const row = {
      ...data,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(data.organizationId, row);
    return row;
  }

  async updateFlags(
    organizationId: string,
    flags: {
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
    },
  ) {
    const existing = this.rows.get(organizationId);
    if (!existing) {
      throw new Error('missing platform account');
    }
    this.flagUpdates += 1;
    const updated = { ...existing, ...flags, updatedAt: new Date() };
    this.rows.set(organizationId, updated);
    return updated;
  }
}

class FakeStripeEvents extends StripeEventRepository {
  readonly rows = new Map<string, StripeEventRecord>();

  async tryInsert(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<StripeEventRecord> {
    const existing = this.rows.get(id);
    if (existing) {
      return existing;
    }
    const row: StripeEventRecord = {
      id,
      type,
      payload,
      processedAt: null,
      createdAt: new Date(),
    };
    this.rows.set(id, row);
    return row;
  }

  async markProcessed(id: string): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) {
      return;
    }
    this.rows.set(id, { ...existing, processedAt: new Date() });
  }
}

describe('Stripe Connect (T-019)', () => {
  let app: INestApplication<App>;
  let gateway: InMemoryPaymentGateway;
  let accounts: FakePlatformAccounts;
  let events: FakeStripeEvents;
  let platformPlan: typeof PlatformPlan.PRO | typeof PlatformPlan.FREE;

  const user = {
    id: USER_ID,
    email: 'owner@example.com',
    deletedAt: null,
    createdAt: new Date(),
    emailVerifiedAt: null,
  };

  const prisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === USER_ID ? user : null,
      ),
    },
    membership: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { organizationId_userId: { organizationId: string; userId: string } };
        }) => {
          const key = where.organizationId_userId;
          if (key.organizationId === ORG_ID && key.userId === USER_ID) {
            return {
              organizationId: ORG_ID,
              userId: USER_ID,
              role: Role.OWNER,
              status: MembershipStatus.ACTIVE,
            };
          }
          return null;
        },
      ),
    },
    organization: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string } }) => {
          if (where.id !== ORG_ID) {
            return null;
          }
          return {
            id: ORG_ID,
            deletedAt: null,
            platformPlan,
          };
        },
      ),
    },
  };

  beforeAll(() => {
    applyTestEnv();
  });

  beforeEach(async () => {
    applyTestEnv();
    platformPlan = PlatformPlan.PRO;
    gateway = new InMemoryPaymentGateway();
    accounts = new FakePlatformAccounts();
    events = new FakeStripeEvents();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .overrideProvider(PlatformAccountRepository)
      .useValue(accounts)
      .overrideProvider(StripeEventRepository)
      .useValue(events)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a fake Connect account link URL', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/connect/onboard`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ country: 'US' })
      .expect(201);

    expect(response.body.url).toMatch(
      /^https:\/\/connect\.stripe\.test\/setup\/acct_/,
    );
    expect(
      gateway.calls.some((call) => call.method === 'createAccountLink'),
    ).toBe(true);
  });

  it('rejects FREE org onboard with FEATURE_GATED', async () => {
    platformPlan = PlatformPlan.FREE;

    const response = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/connect/onboard`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ country: 'US' })
      .expect(403);

    expect(response.body.error.code).toBe('FEATURE_GATED');
    expect(gateway.calls).toEqual([]);
  });

  it('does not apply duplicate account.updated webhooks twice', async () => {
    await accounts.create({
      organizationId: ORG_ID,
      stripeAccountId: 'acct_123',
    });

    const payload = {
      id: 'evt_account_updated_1',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_123',
          object: 'account',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          metadata: { organizationId: ORG_ID },
        },
      },
    };

    const first = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true });
    expect(events.rows.size).toBe(1);
    expect(accounts.flagUpdates).toBe(1);
    const stored = accounts.rows.get(ORG_ID);
    expect(stored?.chargesEnabled).toBe(true);
    expect(stored?.payoutsEnabled).toBe(true);
    expect(stored?.detailsSubmitted).toBe(true);
  });
});
