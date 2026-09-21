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
import { ApiOrganizationsClient } from './api-organizations.client';
import { PlatformBillingService } from './platform-billing.service';

const JWT_SECRET = 'test-jwt-secret-change-me';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function applyTestEnv(): void {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.DATABASE_URL ??=
    'postgresql://shedflow:shedflow@localhost:5533/shedflow?schema=public';
  process.env.APP_URL ??= 'http://localhost:3000';
  process.env.API_URL ??= 'http://localhost:3001';
  process.env.BILLING_URL ??= 'http://localhost:3002';
  process.env.BILLING_PORT ??= '3002';
  process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
  process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_placeholder';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET ??= 'whsec_placeholder';
  process.env.STRIPE_PLATFORM_FEE_BPS ??= '200';
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly_test';
  process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly_test';
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

describe('Platform billing (T-024)', () => {
  let app: INestApplication<App>;
  let gateway: InMemoryPaymentGateway;
  let apiOrgs: { updatePlan: jest.Mock };

  const user = {
    id: USER_ID,
    email: 'owner@example.com',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  };

  const orgRow = {
    id: ORG_ID,
    deletedAt: null as Date | null,
    platformPlan: PlatformPlan.FREE,
    platformStripeCustomerId: null as string | null,
    platformStripeSubscriptionId: null as string | null,
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
          where: {
            organizationId_userId: { organizationId: string; userId: string };
          };
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
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            organizationId: string;
            userId: string;
            status: MembershipStatus;
          };
        }) => {
          if (
            where.organizationId === ORG_ID &&
            where.userId === USER_ID &&
            where.status === MembershipStatus.ACTIVE
          ) {
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
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== ORG_ID) {
          return null;
        }
        return { ...orgRow };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(orgRow, data);
        return { ...orgRow };
      }),
    },
  };

  beforeAll(() => {
    applyTestEnv();
  });

  beforeEach(async () => {
    applyTestEnv();
    orgRow.platformPlan = PlatformPlan.FREE;
    orgRow.platformStripeCustomerId = null;
    orgRow.platformStripeSubscriptionId = null;
    gateway = new InMemoryPaymentGateway();
    apiOrgs = { updatePlan: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .overrideProvider(ApiOrganizationsClient)
      .useValue(apiOrgs)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a fake platform checkout URL', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/platform/checkout`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ interval: 'month' })
      .expect(201);

    expect(response.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(
      gateway.calls.some(
        (c) =>
          c.method === 'createCheckoutSession' &&
          (c.args[0] as { mode: string; metadata: { kind: string } }).mode ===
            'subscription' &&
          (c.args[0] as { metadata: { kind: string } }).metadata.kind ===
            'platform',
      ),
    ).toBe(true);
  });

  it('subscription.created (platform) upgrades org via API plan client', async () => {
    const platform = app.get(PlatformBillingService);
    await platform.applySubscriptionEvent({
      id: 'sub_platform_1',
      object: 'subscription',
      status: 'active',
      cancel_at_period_end: false,
      customer: 'cus_platform_1',
      metadata: { kind: 'platform', organizationId: ORG_ID },
    } as never);

    expect(apiOrgs.updatePlan).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        platformPlan: 'PRO',
        platformStripeCustomerId: 'cus_platform_1',
        platformStripeSubscriptionId: 'sub_platform_1',
      }),
    );
  });

  it('cancel_at_period_end keeps PRO until canceled', async () => {
    const platform = app.get(PlatformBillingService);
    await platform.applySubscriptionEvent({
      id: 'sub_platform_2',
      object: 'subscription',
      status: 'active',
      cancel_at_period_end: true,
      customer: 'cus_platform_2',
      metadata: { kind: 'platform', organizationId: ORG_ID },
    } as never);

    expect(apiOrgs.updatePlan).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ platformPlan: 'PRO' }),
    );

    apiOrgs.updatePlan.mockClear();
    await platform.applySubscriptionEvent({
      id: 'sub_platform_2',
      object: 'subscription',
      status: 'canceled',
      cancel_at_period_end: false,
      customer: 'cus_platform_2',
      metadata: { kind: 'platform', organizationId: ORG_ID },
    } as never);

    expect(apiOrgs.updatePlan).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ platformPlan: 'FREE' }),
    );
  });

  it('returns portal URL when customer exists', async () => {
    orgRow.platformStripeCustomerId = 'cus_existing';
    const response = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/platform/portal`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .expect(201);

    expect(response.body.url).toMatch(/^https:\/\/billing\.stripe\.test\//);
  });
});
