import type Stripe from 'stripe';

export type ConnectStatus = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export type StripeCustomerParams = {
  email: string;
  name?: string;
  stripeAccount?: string;
  metadata?: Record<string, string>;
};

export type CheckoutParams = {
  mode: 'payment' | 'subscription';
  stripePriceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  stripeAccount?: string;
  applicationFeeAmount?: number;
  applicationFeePercent?: number;
  metadata: Record<string, string>;
  expiresAtUnix?: number;
  idempotencyKey?: string;
  clientReferenceId?: string;
  automaticTax?: boolean;
};

export type CreateProductParams = {
  name: string;
  description?: string;
  stripeAccount?: string;
  metadata?: Record<string, string>;
};

export type CreatePriceParams = {
  productId: string;
  currency: string;
  unitAmount: number;
  interval?: 'month' | 'year';
  stripeAccount?: string;
  metadata?: Record<string, string>;
};

export abstract class PaymentGateway {
  abstract createConnectAccount(org: {
    id: string;
    email: string;
    country?: string;
  }): Promise<{ stripeAccountId: string }>;

  abstract createAccountLink(
    stripeAccountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ url: string }>;

  abstract createLoginLink(
    stripeAccountId: string,
  ): Promise<{ url: string }>;

  abstract retrieveAccount(stripeAccountId: string): Promise<ConnectStatus>;

  abstract createCustomer(
    params: StripeCustomerParams,
  ): Promise<{ stripeCustomerId: string }>;

  abstract createCheckoutSession(
    params: CheckoutParams,
  ): Promise<{ id: string; url: string }>;

  abstract expireCheckoutSession(id: string, stripeAccount?: string): Promise<void>;

  abstract createRefund(
    paymentIntentId: string,
    amountMinor: number,
    reason?: string,
    stripeAccount?: string,
  ): Promise<{ id: string }>;

  abstract createProduct(
    params: CreateProductParams,
  ): Promise<{ id: string }>;

  abstract updateProduct(
    stripeProductId: string,
    params: { active?: boolean; name?: string },
    stripeAccount?: string,
  ): Promise<void>;

  abstract createPrice(params: CreatePriceParams): Promise<{ id: string }>;

  abstract createBillingPortalSession(params: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  abstract constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event;
}
