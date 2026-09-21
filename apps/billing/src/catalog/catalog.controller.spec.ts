import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus, PlatformPlan, Role } from '@shedflow/db';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { InMemoryPaymentGateway } from '../payments/in-memory-payment-gateway';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogPrice,
  CreateCatalogPriceData,
  PriceRepository,
} from './price.repository';
import {
  CatalogProduct,
  CreateCatalogProductData,
  ProductRepository,
  UpdateCatalogProductData,
} from './product.repository';

const JWT_SECRET = 'test-jwt-secret-change-me';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function applyTestEnv(): void {
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

function signAccessToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      email: 'owner@example.com',
      orgId: ORG_ID,
      role: 'OWNER',
      typ: 'access',
      iat: now,
      exp: now + 900,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', process.env.JWT_SECRET ?? JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

class FakeProducts extends ProductRepository {
  readonly rows = new Map<string, CatalogProduct>();

  async findByOrganizationId(organizationId: string) {
    return [...this.rows.values()]
      .filter((row) => row.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(organizationId: string, productId: string) {
    const row = this.rows.get(productId);
    if (!row || row.organizationId !== organizationId) {
      return null;
    }
    return row;
  }

  async create(data: CreateCatalogProductData) {
    const now = new Date();
    const row: CatalogProduct = {
      id: randomUUID(),
      ...data,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    organizationId: string,
    productId: string,
    data: UpdateCatalogProductData,
  ) {
    const existing = await this.findById(organizationId, productId);
    if (!existing) {
      throw new Error('missing product');
    }
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.rows.set(productId, updated);
    return updated;
  }
}

class FakePrices extends PriceRepository {
  readonly rows: CatalogPrice[] = [];

  async findByProductId(organizationId: string, productId: string) {
    return this.rows.filter(
      (row) =>
        row.organizationId === organizationId && row.productId === productId,
    );
  }

  async findById(organizationId: string, priceId: string) {
    return (
      this.rows.find(
        (row) => row.id === priceId && row.organizationId === organizationId,
      ) ?? null
    );
  }

  async findByStripePriceId(organizationId: string, stripePriceId: string) {
    return (
      this.rows.find(
        (row) =>
          row.stripePriceId === stripePriceId &&
          row.organizationId === organizationId,
      ) ?? null
    );
  }

  async create(data: CreateCatalogPriceData) {
    const row: CatalogPrice = {
      id: randomUUID(),
      ...data,
      intervalCount: data.intervalCount ?? 1,
      isActive: true,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

class FakePlatformAccounts extends PlatformAccountRepository {
  constructor(private readonly stripeAccountId = 'acct_test_catalog') {
    super();
  }

  async findByOrganizationId(organizationId: string) {
    if (organizationId !== ORG_ID) {
      return null;
    }
    const now = new Date();
    return {
      organizationId,
      stripeAccountId: this.stripeAccountId,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findByStripeAccountId() {
    return null;
  }

  async create() {
    throw new Error('not used');
  }

  async updateFlags() {
    throw new Error('not used');
  }
}

describe('Product catalog (T-020)', () => {
  let app: INestApplication<App>;
  let gateway: InMemoryPaymentGateway;
  let products: FakeProducts;
  let prices: FakePrices;
  let orgCurrency = 'USD';

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
    },
    organization: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== ORG_ID) {
          return null;
        }
        return {
          id: ORG_ID,
          deletedAt: null,
          platformPlan: PlatformPlan.PRO,
          currency: orgCurrency,
        };
      }),
    },
  };

  beforeAll(() => {
    applyTestEnv();
  });

  beforeEach(async () => {
    applyTestEnv();
    orgCurrency = 'USD';
    gateway = new InMemoryPaymentGateway();
    products = new FakeProducts();
    prices = new FakePrices();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .overrideProvider(PlatformAccountRepository)
      .useValue(new FakePlatformAccounts())
      .overrideProvider(ProductRepository)
      .useValue(products)
      .overrideProvider(PriceRepository)
      .useValue(prices)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a one-time product and price via the fake gateway', async () => {
    const productRes = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/products`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ name: 'Session fee', type: 'ONE_TIME' })
      .expect(201);

    expect(productRes.body.stripeProductId).toMatch(/^prod_/);
    expect(
      gateway.calls.some((call) => call.method === 'createProduct'),
    ).toBe(true);

    const priceRes = await request(app.getHttpServer())
      .post(
        `/v1/billing/organizations/${ORG_ID}/products/${productRes.body.id}/prices`,
      )
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ amountMinor: 5000, currency: 'USD' })
      .expect(201);

    expect(priceRes.body.stripePriceId).toMatch(/^price_/);
    expect(priceRes.body.interval).toBeNull();
    expect(
      gateway.calls.some((call) => call.method === 'createPrice'),
    ).toBe(true);
  });

  it('creates a recurring product and monthly price', async () => {
    const productRes = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/products`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({
        name: 'Membership',
        type: 'RECURRING',
        creditGrantPerPeriod: 4,
      })
      .expect(201);

    expect(productRes.body.creditGrantPerPeriod).toBe(4);

    const priceRes = await request(app.getHttpServer())
      .post(
        `/v1/billing/organizations/${ORG_ID}/products/${productRes.body.id}/prices`,
      )
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ amountMinor: 2000, currency: 'usd', interval: 'month' })
      .expect(201);

    expect(priceRes.body.interval).toBe('month');
    const createPriceCall = gateway.calls.find(
      (call) => call.method === 'createPrice',
    );
    expect(createPriceCall?.args[0]).toMatchObject({
      interval: 'month',
      currency: 'USD',
      unitAmount: 2000,
      stripeAccount: 'acct_test_catalog',
    });
  });

  it('rejects price currency that does not match the org', async () => {
    const productRes = await request(app.getHttpServer())
      .post(`/v1/billing/organizations/${ORG_ID}/products`)
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ name: 'Session fee', type: 'ONE_TIME' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(
        `/v1/billing/organizations/${ORG_ID}/products/${productRes.body.id}/prices`,
      )
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ amountMinor: 5000, currency: 'EUR' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors.currency).toEqual([
      'Must be USD',
    ]);
    expect(
      gateway.calls.filter((call) => call.method === 'createPrice'),
    ).toHaveLength(0);
  });
});
