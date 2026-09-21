import { Injectable } from '@nestjs/common';
import {
  CheckoutParams,
} from './payment-gateway';
import { InMemoryPaymentGateway } from './in-memory-payment-gateway';

describe('InMemoryPaymentGateway', () => {
  it('returns fake checkout URLs and records calls', async () => {
    const gateway = new InMemoryPaymentGateway();
    const params: CheckoutParams = {
      mode: 'payment',
      stripePriceId: 'price_1',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
      metadata: { kind: 'booking' },
    };

    const session = await gateway.createCheckoutSession(params);

    expect(session.id).toMatch(/^cs_/);
    expect(session.url).toContain(session.id);
    expect(gateway.calls).toEqual([
      { method: 'createCheckoutSession', args: [params] },
    ]);
  });

  it('rejects webhook construction without a signature', () => {
    const gateway = new InMemoryPaymentGateway();
    expect(() =>
      gateway.constructWebhookEvent(Buffer.from('{}'), '', 'whsec_test'),
    ).toThrow('Missing Stripe signature');
  });

  it('returns a Connect account link URL', async () => {
    const gateway = new InMemoryPaymentGateway();
    const created = await gateway.createConnectAccount({
      id: 'org_1',
      email: 'owner@example.com',
      country: 'US',
    });
    const link = await gateway.createAccountLink(
      created.stripeAccountId,
      'https://app.test/return',
      'https://app.test/refresh',
    );
    expect(link.url).toBe(
      `https://connect.stripe.test/setup/${created.stripeAccountId}`,
    );
  });
});
