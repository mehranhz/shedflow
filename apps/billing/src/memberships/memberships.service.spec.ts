import { MembershipsService } from './memberships.service';
import { CreditsService } from '../credits/credits.service';
import { InMemoryPaymentGateway } from '../payments/in-memory-payment-gateway';
import type { CatalogPrice } from '../catalog/price.repository';
import type { CatalogProduct } from '../catalog/product.repository';

describe('MembershipsService (T-022)', () => {
  const ORG = '11111111-1111-4111-8111-111111111111';
  const CUSTOMER = '44444444-4444-4444-8444-444444444444';
  const PRODUCT = '66666666-6666-4666-8666-666666666666';
  const PRICE = '55555555-5555-4555-8555-555555555555';

  const product: CatalogProduct = {
    id: PRODUCT,
    organizationId: ORG,
    name: 'Club',
    type: 'RECURRING',
    stripeProductId: 'prod_stripe',
    creditGrantPerPeriod: 5,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const price: CatalogPrice = {
    id: PRICE,
    productId: PRODUCT,
    organizationId: ORG,
    amountMinor: 2000,
    currency: 'USD',
    interval: 'month',
    intervalCount: 1,
    stripePriceId: 'price_stripe_membership',
    isActive: true,
    createdAt: new Date(),
  };

  it('creates subscription checkout URL via fake gateway', async () => {
    const gateway = new InMemoryPaymentGateway();
    const periodReset = jest.fn().mockResolvedValue({ balance: 5 });
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };
    const subscriptions = {
      findByStripeSubscriptionId: jest.fn(),
      findActiveForCustomer: jest.fn(),
      upsertByStripeId: jest.fn(),
    };
    const stripeCustomers = {
      findByCustomer: jest.fn().mockResolvedValue(null),
      findByStripeCustomerId: jest.fn(),
      upsert: jest.fn().mockResolvedValue({
        id: 'sc_1',
        organizationId: ORG,
        customerId: CUSTOMER,
        stripeCustomerId: 'cus_1',
      }),
    };

    const service = new MembershipsService(
      {
        findByOrganizationId: jest.fn().mockResolvedValue({
          organizationId: ORG,
          stripeAccountId: 'acct_1',
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as never,
      {
        findById: jest.fn().mockResolvedValue(product),
      } as never,
      {
        findById: jest.fn().mockResolvedValue(price),
        findByStripePriceId: jest.fn().mockResolvedValue(price),
      } as never,
      stripeCustomers as never,
      subscriptions as never,
      gateway,
      { periodReset } as unknown as CreditsService,
      outbox as never,
      { get: () => 200 } as never,
    );

    const result = await service.createCheckoutSession({
      organizationId: ORG,
      customerId: CUSTOMER,
      priceId: PRICE,
      invitee: { email: 'member@example.com', name: 'Member' },
      successUrl: 'http://localhost:3000/ok',
      cancelUrl: 'http://localhost:3000/cancel',
    });

    expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(
      gateway.calls.some(
        (c) =>
          c.method === 'createCheckoutSession' &&
          (c.args[0] as { mode: string }).mode === 'subscription',
      ),
    ).toBe(true);
  });

  it('invoice.paid triggers period reset to grant', async () => {
    const periodReset = jest.fn().mockResolvedValue({ balance: 5 });
    const outbox = { emit: jest.fn().mockResolvedValue(undefined) };
    const sub = {
      id: 'sub-uuid',
      organizationId: ORG,
      customerId: CUSTOMER,
      productId: PRODUCT,
      priceId: PRICE,
      stripeSubscriptionId: 'sub_test_1',
      status: 'ACTIVE' as const,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const service = new MembershipsService(
      { findByOrganizationId: jest.fn() } as never,
      { findById: jest.fn().mockResolvedValue(product) } as never,
      { findById: jest.fn(), findByStripePriceId: jest.fn() } as never,
      {
        findByCustomer: jest.fn(),
        findByStripeCustomerId: jest.fn(),
        upsert: jest.fn(),
      } as never,
      {
        findByStripeSubscriptionId: jest.fn().mockResolvedValue(sub),
        findActiveForCustomer: jest.fn(),
        upsertByStripeId: jest.fn(),
      } as never,
      new InMemoryPaymentGateway(),
      { periodReset } as unknown as CreditsService,
      outbox as never,
      { get: () => 200 } as never,
    );

    await service.applyInvoicePaid({
      id: 'in_1',
      subscription: 'sub_test_1',
      period_start: 1704067200,
      period_end: 1706745600,
      metadata: {},
    } as never);

    expect(periodReset).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        customerId: CUSTOMER,
        grant: 5,
      }),
    );
    expect(outbox.emit).toHaveBeenCalled();
  });
});
