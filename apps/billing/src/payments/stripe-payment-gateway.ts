import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CheckoutParams,
  ConnectStatus,
  CreatePriceParams,
  CreateProductParams,
  PaymentGateway,
  StripeCustomerParams,
} from './payment-gateway';

@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  private readonly stripe: Stripe;

  constructor(config: ConfigService) {
    super();
    this.stripe = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
  }

  async createConnectAccount(org: {
    id: string;
    email: string;
    country?: string;
  }): Promise<{ stripeAccountId: string }> {
    const account = await this.stripe.accounts.create({
      type: 'express',
      country: org.country ?? 'US',
      email: org.email,
      metadata: { organizationId: org.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    return { stripeAccountId: account.id };
  }

  async createAccountLink(
    stripeAccountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ url: string }> {
    const link = await this.stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url };
  }

  async createLoginLink(stripeAccountId: string): Promise<{ url: string }> {
    const link = await this.stripe.accounts.createLoginLink(stripeAccountId);
    return { url: link.url };
  }

  async retrieveAccount(stripeAccountId: string): Promise<ConnectStatus> {
    const account = await this.stripe.accounts.retrieve(stripeAccountId);
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    };
  }

  async createCustomer(
    params: StripeCustomerParams,
  ): Promise<{ stripeCustomerId: string }> {
    const customer = await this.stripe.customers.create(
      {
        email: params.email,
        name: params.name,
        metadata: params.metadata,
      },
      requestOptions(params.stripeAccount),
    );
    return { stripeCustomerId: customer.id };
  }

  async createCheckoutSession(
    params: CheckoutParams,
  ): Promise<{ id: string; url: string }> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: params.mode,
        line_items: [{ price: params.stripePriceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer: params.stripeCustomerId,
        customer_email: params.stripeCustomerId
          ? undefined
          : params.customerEmail,
        client_reference_id: params.clientReferenceId,
        metadata: params.metadata,
        expires_at: params.expiresAtUnix,
        automatic_tax: params.automaticTax
          ? { enabled: true }
          : undefined,
        payment_intent_data:
          params.mode === 'payment' && params.applicationFeeAmount != null
            ? { application_fee_amount: params.applicationFeeAmount }
            : undefined,
        subscription_data:
          params.mode === 'subscription' &&
          params.applicationFeePercent != null
            ? { application_fee_percent: params.applicationFeePercent }
            : undefined,
      },
      {
        ...requestOptions(params.stripeAccount),
        idempotencyKey: params.idempotencyKey,
      },
    );
    if (!session.url) {
      throw new Error('Stripe Checkout session did not return a URL');
    }
    return { id: session.id, url: session.url };
  }

  async expireCheckoutSession(
    id: string,
    stripeAccount?: string,
  ): Promise<void> {
    await this.stripe.checkout.sessions.expire(id, requestOptions(stripeAccount));
  }

  async createRefund(
    paymentIntentId: string,
    amountMinor: number,
    reason?: string,
    stripeAccount?: string,
  ): Promise<{ id: string }> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amountMinor,
        reason: reason as Stripe.RefundCreateParams.Reason | undefined,
        refund_application_fee: true,
      },
      requestOptions(stripeAccount),
    );
    return { id: refund.id };
  }

  async createProduct(params: CreateProductParams): Promise<{ id: string }> {
    const product = await this.stripe.products.create(
      {
        name: params.name,
        description: params.description,
        metadata: params.metadata,
      },
      requestOptions(params.stripeAccount),
    );
    return { id: product.id };
  }

  async updateProduct(
    stripeProductId: string,
    params: { active?: boolean; name?: string },
    stripeAccount?: string,
  ): Promise<void> {
    await this.stripe.products.update(
      stripeProductId,
      {
        active: params.active,
        name: params.name,
      },
      requestOptions(stripeAccount),
    );
  }

  async createPrice(params: CreatePriceParams): Promise<{ id: string }> {
    const price = await this.stripe.prices.create(
      {
        product: params.productId,
        currency: params.currency,
        unit_amount: params.unitAmount,
        recurring: params.interval
          ? { interval: params.interval }
          : undefined,
        metadata: params.metadata,
      },
      requestOptions(params.stripeAccount),
    );
    return { id: price.id };
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}

function requestOptions(
  stripeAccount?: string,
): Stripe.RequestOptions | undefined {
  return stripeAccount ? { stripeAccount } : undefined;
}
