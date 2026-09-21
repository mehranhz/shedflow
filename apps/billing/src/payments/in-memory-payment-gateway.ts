import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import {
  CheckoutParams,
  ConnectStatus,
  CreatePriceParams,
  CreateProductParams,
  PaymentGateway,
  StripeCustomerParams,
} from './payment-gateway';

@Injectable()
export class InMemoryPaymentGateway extends PaymentGateway {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private seq = 0;
  private readonly checkoutByIdempotency = new Map<
    string,
    { id: string; url: string }
  >();

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async createConnectAccount(org: {
    id: string;
    email: string;
    country?: string;
  }): Promise<{ stripeAccountId: string }> {
    this.record('createConnectAccount', [org]);
    return { stripeAccountId: this.nextId('acct') };
  }

  async createAccountLink(
    stripeAccountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ url: string }> {
    this.record('createAccountLink', [stripeAccountId, returnUrl, refreshUrl]);
    return {
      url: `https://connect.stripe.test/setup/${stripeAccountId}`,
    };
  }

  async createLoginLink(stripeAccountId: string): Promise<{ url: string }> {
    this.record('createLoginLink', [stripeAccountId]);
    return {
      url: `https://connect.stripe.test/express/${stripeAccountId}`,
    };
  }

  async retrieveAccount(stripeAccountId: string): Promise<ConnectStatus> {
    this.record('retrieveAccount', [stripeAccountId]);
    return {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    };
  }

  async createCustomer(
    params: StripeCustomerParams,
  ): Promise<{ stripeCustomerId: string }> {
    this.record('createCustomer', [params]);
    return { stripeCustomerId: this.nextId('cus') };
  }

  async createCheckoutSession(
    params: CheckoutParams,
  ): Promise<{ id: string; url: string }> {
    this.record('createCheckoutSession', [params]);
    if (params.idempotencyKey) {
      const existing = this.checkoutByIdempotency.get(params.idempotencyKey);
      if (existing) {
        return existing;
      }
    }
    const id = this.nextId('cs');
    const session = { id, url: `https://checkout.stripe.test/c/pay/${id}` };
    if (params.idempotencyKey) {
      this.checkoutByIdempotency.set(params.idempotencyKey, session);
    }
    return session;
  }

  async expireCheckoutSession(
    id: string,
    stripeAccount?: string,
  ): Promise<void> {
    this.record('expireCheckoutSession', [id, stripeAccount]);
  }

  async createRefund(
    paymentIntentId: string,
    amountMinor: number,
    reason?: string,
    stripeAccount?: string,
  ): Promise<{ id: string }> {
    this.record('createRefund', [
      paymentIntentId,
      amountMinor,
      reason,
      stripeAccount,
    ]);
    return { id: this.nextId('re') };
  }

  async createProduct(params: CreateProductParams): Promise<{ id: string }> {
    this.record('createProduct', [params]);
    return { id: this.nextId('prod') };
  }

  async updateProduct(
    stripeProductId: string,
    params: { active?: boolean; name?: string },
    stripeAccount?: string,
  ): Promise<void> {
    this.record('updateProduct', [stripeProductId, params, stripeAccount]);
  }

  async createPrice(params: CreatePriceParams): Promise<{ id: string }> {
    this.record('createPrice', [params]);
    return { id: this.nextId('price') };
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    _secret: string,
  ): Stripe.Event {
    this.record('constructWebhookEvent', [rawBody, signature]);
    if (!signature) {
      throw new Error('Missing Stripe signature');
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody.toString('utf8') || '{}') as Record<
        string,
        unknown
      >;
    } catch {
      parsed = {};
    }
    return {
      id: typeof parsed.id === 'string' ? parsed.id : this.nextId('evt'),
      object: 'event',
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: (parsed.data as { object?: Stripe.Event.Data.Object })?.object ??
          (parsed as unknown as Stripe.Event.Data.Object),
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type:
        typeof parsed.type === 'string'
          ? (parsed.type as Stripe.Event.Type)
          : 'checkout.session.completed',
    } as Stripe.Event;
  }
}
