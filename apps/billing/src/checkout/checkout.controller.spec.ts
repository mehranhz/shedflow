import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentStatus } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import {
  CatalogPrice,
  CreateCatalogPriceData,
  PriceRepository,
} from '../catalog/price.repository';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { InMemoryPaymentGateway } from '../payments/in-memory-payment-gateway';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import {
  StripeEventRecord,
  StripeEventRepository,
} from '../stripe-events/stripe-event.repository';
import { ApiBookingsClient } from './api-bookings.client';
import { BillingOutbox } from './billing-outbox';
import {
  CreatePaymentData,
  PaymentRecord,
  PaymentRepository,
} from './payment.repository';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const PRICE_ID = '55555555-5555-4555-8555-555555555555';

function applyTestEnv(): void {
  process.env.JWT_SECRET = 'test-jwt-secret-change-me';
  process.env.DATABASE_URL ??=
    'postgresql://shedflow:shedflow@localhost:5434/shedflow_test?schema=public';
  process.env.APP_URL ??= 'http://localhost:3000';
  process.env.API_URL ??= 'http://localhost:3001';
  process.env.BILLING_URL ??= 'http://localhost:3002';
  process.env.BILLING_PORT ??= '3002';
  process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
  process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_placeholder';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET ??= 'whsec_placeholder';
  process.env.STRIPE_PLATFORM_FEE_BPS ??= '200';
}

class FakePayments extends PaymentRepository {
  readonly rows = new Map<string, PaymentRecord>();

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findByBookingId(bookingId: string) {
    return (
      [...this.rows.values()]
        .filter((row) => row.bookingId === bookingId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      null
    );
  }

  async findByCheckoutSessionId(sessionId: string) {
    return (
      [...this.rows.values()].find(
        (row) => row.stripeCheckoutSessionId === sessionId,
      ) ?? null
    );
  }

  async create(data: CreatePaymentData) {
    const now = new Date();
    const row: PaymentRecord = {
      id: randomUUID(),
      ...data,
      stripePaymentIntentId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    patch?: {
      stripePaymentIntentId?: string | null;
      stripeCheckoutSessionId?: string | null;
    },
  ) {
    const existing = this.rows.get(id);
    if (!existing) {
      throw new Error('missing payment');
    }
    const updated = {
      ...existing,
      status,
      stripePaymentIntentId:
        patch?.stripePaymentIntentId ?? existing.stripePaymentIntentId,
      stripeCheckoutSessionId:
        patch?.stripeCheckoutSessionId ?? existing.stripeCheckoutSessionId,
      updatedAt: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
  }
}

class FakePrices extends PriceRepository {
  constructor(private readonly price: CatalogPrice) {
    super();
  }

  async findByProductId() {
    return [this.price];
  }

  async findById(organizationId: string, priceId: string) {
    if (organizationId === this.price.organizationId && priceId === this.price.id) {
      return this.price;
    }
    return null;
  }

  async findByStripePriceId() {
    return null;
  }

  async create(_data: CreateCatalogPriceData) {
    throw new Error('not used');
  }
}

class FakePlatformAccounts extends PlatformAccountRepository {
  constructor(private readonly chargesEnabled: boolean) {
    super();
  }

  async findByOrganizationId(organizationId: string) {
    if (organizationId !== ORG_ID) {
      return null;
    }
    const now = new Date();
    return {
      organizationId,
      stripeAccountId: 'acct_test_checkout',
      chargesEnabled: this.chargesEnabled,
      payoutsEnabled: this.chargesEnabled,
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

class FakeStripeEvents extends StripeEventRepository {
  readonly rows = new Map<string, StripeEventRecord>();

  async tryInsert(id: string, type: string, payload: unknown) {
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

  async markProcessed(id: string) {
    const existing = this.rows.get(id);
    if (!existing) {
      return;
    }
    this.rows.set(id, { ...existing, processedAt: new Date() });
  }
}

class FakeOutbox {
  readonly events: Array<{ type: string; payload: Record<string, unknown> }> =
    [];

  async emit(
    type: string,
    payload: Record<string, unknown>,
    _organizationId?: string | null,
  ) {
    this.events.push({ type, payload });
  }
}

describe('Paid bookings checkout (T-021)', () => {
  let app: INestApplication<App>;
  let gateway: InMemoryPaymentGateway;
  let payments: FakePayments;
  let events: FakeStripeEvents;
  let outbox: FakeOutbox;
  let apiBookings: { confirmBooking: jest.Mock; expireBooking: jest.Mock };
  let chargesEnabled = true;

  const price: CatalogPrice = {
    id: PRICE_ID,
    productId: randomUUID(),
    organizationId: ORG_ID,
    amountMinor: 5000,
    currency: 'USD',
    interval: null,
    intervalCount: 1,
    stripePriceId: 'price_stripe_1',
    isActive: true,
    createdAt: new Date(),
  };

  const prisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: { findUnique: jest.fn() },
    membership: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    domainEvent: { create: jest.fn() },
  };

  beforeAll(() => {
    applyTestEnv();
  });

  beforeEach(async () => {
    applyTestEnv();
    chargesEnabled = true;
    gateway = new InMemoryPaymentGateway();
    payments = new FakePayments();
    events = new FakeStripeEvents();
    outbox = new FakeOutbox();
    apiBookings = {
      confirmBooking: jest.fn().mockResolvedValue(undefined),
      expireBooking: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .overrideProvider(PaymentRepository)
      .useValue(payments)
      .overrideProvider(PriceRepository)
      .useValue(new FakePrices(price))
      .overrideProvider(PlatformAccountRepository)
      .useValue(new FakePlatformAccounts(chargesEnabled))
      .overrideProvider(StripeEventRepository)
      .useValue(events)
      .overrideProvider(BillingOutbox)
      .useValue(outbox)
      .overrideProvider(ApiBookingsClient)
      .useValue(apiBookings)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function signInternal(body: string) {
    const {
      signInternalRequest,
      internalTimestamp,
      INTERNAL_SIGNATURE_HEADER,
      INTERNAL_TIMESTAMP_HEADER,
    } = require('@shedflow/shared/internalAuth') as typeof import('@shedflow/shared/internalAuth');
    const path = '/internal/checkout-sessions';
    const timestamp = internalTimestamp();
    const signature = signInternalRequest({
      secret: process.env.INTERNAL_API_SECRET!,
      timestamp,
      method: 'POST',
      path,
      body,
    });
    return {
      path,
      headers: {
        [INTERNAL_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_SIGNATURE_HEADER]: signature,
        'Content-Type': 'application/json',
      },
    };
  }

  it('returns a checkout URL and stores stripeProduct payment via fake gateway', async () => {
    const payload = {
      organizationId: ORG_ID,
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      priceId: PRICE_ID,
      invitee: { email: 'pay@example.com', name: 'Pay' },
      successUrl: 'http://localhost:3000/b/uid/success',
      cancelUrl: 'http://localhost:3000/b/uid',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    const body = JSON.stringify(payload);
    const { path, headers } = signInternal(body);

    const response = await request(app.getHttpServer())
      .post(path)
      .set(headers)
      .send(body)
      .expect(201);

    expect(response.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(response.body.paymentId).toBeDefined();
    expect(
      gateway.calls.some((call) => call.method === 'createCheckoutSession'),
    ).toBe(true);
    const stored = await payments.findByBookingId(BOOKING_ID);
    expect(stored?.status).toBe(PaymentStatus.REQUIRES_PAYMENT);
    expect(stored?.applicationFeeMinor).toBe(100);
  });

  it('rejects checkout when Connect charges are not enabled', async () => {
    await app.close();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .overrideProvider(PaymentRepository)
      .useValue(payments)
      .overrideProvider(PriceRepository)
      .useValue(new FakePrices(price))
      .overrideProvider(PlatformAccountRepository)
      .useValue(new FakePlatformAccounts(false))
      .overrideProvider(StripeEventRepository)
      .useValue(events)
      .overrideProvider(BillingOutbox)
      .useValue(outbox)
      .overrideProvider(ApiBookingsClient)
      .useValue(apiBookings)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    const payload = {
      organizationId: ORG_ID,
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      priceId: PRICE_ID,
      invitee: { email: 'pay@example.com', name: 'Pay' },
      successUrl: 'http://localhost:3000/b/uid/success',
      cancelUrl: 'http://localhost:3000/b/uid',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    const body = JSON.stringify(payload);
    const { path, headers } = signInternal(body);

    const response = await request(app.getHttpServer())
      .post(path)
      .set(headers)
      .send(body)
      .expect(422);

    expect(response.body.error.code).toBe('CONNECT_INCOMPLETE');
  });

  it('marks payment succeeded and confirms booking on checkout.session.completed', async () => {
    await payments.create({
      organizationId: ORG_ID,
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      stripeCheckoutSessionId: 'cs_test_1',
      amountMinor: 5000,
      currency: 'USD',
      applicationFeeMinor: 100,
      status: PaymentStatus.REQUIRES_PAYMENT,
    });

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send({
        id: 'evt_paid_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_1',
            payment_status: 'paid',
            payment_intent: 'pi_1',
            metadata: {
              organizationId: ORG_ID,
              bookingId: BOOKING_ID,
              customerId: CUSTOMER_ID,
              kind: 'booking',
            },
          },
        },
      })
      .expect(200);

    const stored = await payments.findByCheckoutSessionId('cs_test_1');
    expect(stored?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(outbox.events.some((e) => e.type === DOMAIN_EVENTS.PaymentSucceeded)).toBe(
      true,
    );
    expect(apiBookings.confirmBooking).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('revives by confirming again when paid after hold expiry webhook race', async () => {
    await payments.create({
      organizationId: ORG_ID,
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      stripeCheckoutSessionId: 'cs_test_revive',
      amountMinor: 5000,
      currency: 'USD',
      applicationFeeMinor: 100,
      status: PaymentStatus.REQUIRES_PAYMENT,
    });

    // Simulate expire job already ran (booking EXPIRED on API); payment still open.
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send({
        id: 'evt_paid_revive',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_revive',
            payment_status: 'paid',
            payment_intent: 'pi_revive',
            metadata: {
              organizationId: ORG_ID,
              bookingId: BOOKING_ID,
              customerId: CUSTOMER_ID,
              kind: 'booking',
            },
          },
        },
      })
      .expect(200);

    expect(apiBookings.confirmBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(
      (await payments.findByCheckoutSessionId('cs_test_revive'))?.status,
    ).toBe(PaymentStatus.SUCCEEDED);
  });

  it('does not double-process duplicate completed webhooks', async () => {
    await payments.create({
      organizationId: ORG_ID,
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      stripeCheckoutSessionId: 'cs_dup',
      amountMinor: 5000,
      currency: 'USD',
      applicationFeeMinor: 100,
      status: PaymentStatus.REQUIRES_PAYMENT,
    });

    const payload = {
      id: 'evt_dup_paid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_dup',
          payment_status: 'paid',
          payment_intent: 'pi_dup',
          metadata: {
            organizationId: ORG_ID,
            bookingId: BOOKING_ID,
            customerId: CUSTOMER_ID,
            kind: 'booking',
          },
        },
      },
    };

    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .send(payload)
      .expect(200);
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'sig_test')
      .send(payload)
      .expect(200);

    expect(apiBookings.confirmBooking).toHaveBeenCalledTimes(1);
    expect(outbox.events.filter((e) => e.type === DOMAIN_EVENTS.PaymentSucceeded)).toHaveLength(
      1,
    );
  });
});
