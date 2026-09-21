import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import type Stripe from 'stripe';
import { PriceRepository } from '../catalog/price.repository';
import { ProductRepository } from '../catalog/product.repository';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { BillingOutbox } from '../checkout/billing-outbox';
import { CreditsService } from '../credits/credits.service';
import { PaymentGateway } from '../payments/payment-gateway';
import { StripeCustomerRepository } from './stripe-customer.repository';
import { SubscriptionRepository } from './subscription.repository';

export type CreateMembershipCheckoutInput = {
  organizationId: string;
  customerId: string;
  priceId: string;
  invitee: { email: string; name: string };
  successUrl: string;
  cancelUrl: string;
};

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.CANCELED,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.PAUSED,
};

@Injectable()
export class MembershipsService {
  constructor(
    private readonly accounts: PlatformAccountRepository,
    private readonly products: ProductRepository,
    private readonly prices: PriceRepository,
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: PaymentGateway,
    private readonly credits: CreditsService,
    private readonly outbox: BillingOutbox,
    private readonly config: ConfigService,
  ) {}

  async createCheckoutSession(
    input: CreateMembershipCheckoutInput,
  ): Promise<{ url: string }> {
    const account = await this.accounts.findByOrganizationId(
      input.organizationId,
    );
    if (!account || !account.chargesEnabled) {
      throw new UnprocessableEntityException({
        code: 'CONNECT_INCOMPLETE',
        message: 'Stripe Connect charges are not enabled for this organization.',
      });
    }

    const price = await this.prices.findById(
      input.organizationId,
      input.priceId,
    );
    if (!price || !price.isActive) {
      throw new NotFoundException('Price not found');
    }
    const product = await this.products.findById(
      input.organizationId,
      price.productId,
    );
    if (!product || product.type !== 'RECURRING') {
      throw new UnprocessableEntityException({
        message: 'Membership requires a recurring product price',
      });
    }

    let stripeCustomer = await this.stripeCustomers.findByCustomer(
      input.organizationId,
      input.customerId,
    );
    if (!stripeCustomer) {
      const created = await this.gateway.createCustomer({
        email: input.invitee.email,
        name: input.invitee.name,
        stripeAccount: account.stripeAccountId,
        metadata: {
          organizationId: input.organizationId,
          customerId: input.customerId,
        },
      });
      stripeCustomer = await this.stripeCustomers.upsert({
        organizationId: input.organizationId,
        customerId: input.customerId,
        stripeCustomerId: created.stripeCustomerId,
      });
    }

    const feeBps = this.config.get<number>('STRIPE_PLATFORM_FEE_BPS') ?? 200;
    const session = await this.gateway.createCheckoutSession({
      mode: 'subscription',
      stripePriceId: price.stripePriceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      stripeAccount: account.stripeAccountId,
      applicationFeePercent: feeBps / 100,
      metadata: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        productId: product.id,
        priceId: price.id,
        kind: 'membership',
      },
      idempotencyKey: `membership:${input.organizationId}:${input.customerId}:${price.id}`,
    });

    return { url: session.url };
  }

  async applySubscriptionEvent(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const meta = subscription.metadata ?? {};
    if (meta.kind && meta.kind !== 'membership') {
      return;
    }

    const organizationId =
      meta.organizationId ??
      (await this.resolveOrgFromCustomer(subscription.customer));
    const customerId =
      meta.customerId ??
      (await this.resolveCustomerId(subscription.customer));
    if (!organizationId || !customerId) {
      return;
    }

    const item = subscription.items.data[0];
    const stripePriceId = item?.price?.id;
    if (!stripePriceId) {
      return;
    }

    const price = await this.prices.findByStripePriceId(
      organizationId,
      stripePriceId,
    );
    if (!price) {
      return;
    }

    const status =
      STATUS_MAP[subscription.status] ?? SubscriptionStatus.INCOMPLETE;
    const periodStart = new Date(
      (subscription.items.data[0]?.current_period_start ??
        (subscription as { current_period_start?: number })
          .current_period_start ??
        Math.floor(Date.now() / 1000)) * 1000,
    );
    const periodEnd = new Date(
      (subscription.items.data[0]?.current_period_end ??
        (subscription as { current_period_end?: number }).current_period_end ??
        Math.floor(Date.now() / 1000)) * 1000,
    );

    const existing = await this.subscriptions.findByStripeSubscriptionId(
      subscription.id,
    );
    const upserted = await this.subscriptions.upsertByStripeId({
      organizationId,
      customerId,
      productId: price.productId,
      priceId: price.id,
      stripeSubscriptionId: subscription.id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    });

    const eventType = existing
      ? status === SubscriptionStatus.CANCELED
        ? DOMAIN_EVENTS.SubscriptionCanceled
        : DOMAIN_EVENTS.SubscriptionUpdated
      : DOMAIN_EVENTS.SubscriptionCreated;

    await this.outbox.emit(
      eventType,
      {
        subscriptionId: upserted.id,
        organizationId,
        customerId,
        status,
      },
      organizationId,
    );
  }

  async applyInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const stripeSubId = this.invoiceSubscriptionId(invoice);
    if (!stripeSubId) {
      return;
    }

    let sub = await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
    if (!sub && invoice.metadata?.organizationId) {
      // Subscription webhook may arrive after invoice; nothing to grant yet.
      return;
    }
    if (!sub) {
      return;
    }

    const product = await this.products.findById(
      sub.organizationId,
      sub.productId,
    );
    if (!product) {
      return;
    }

    const periodStart = invoice.period_start
      ? new Date(invoice.period_start * 1000)
      : sub.currentPeriodStart;
    const periodEnd = invoice.period_end
      ? new Date(invoice.period_end * 1000)
      : sub.currentPeriodEnd;

    await this.credits.periodReset({
      organizationId: sub.organizationId,
      customerId: sub.customerId,
      subscriptionId: sub.id,
      grant: product.creditGrantPerPeriod,
      periodStart,
      periodEnd,
    });

    await this.outbox.emit(
      DOMAIN_EVENTS.SubscriptionRenewed,
      {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        customerId: sub.customerId,
        grant: product.creditGrantPerPeriod,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
      sub.organizationId,
    );
  }

  async applyInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const stripeSubId = this.invoiceSubscriptionId(invoice);
    if (!stripeSubId) {
      return;
    }
    const sub = await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
    if (!sub) {
      return;
    }
    await this.subscriptions.upsertByStripeId({
      ...sub,
      status: SubscriptionStatus.PAST_DUE,
    });
    // Dunning email outbox is emitted by InvoicesService.applyPaymentFailed.
  }

  private invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const raw =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription &&
            typeof invoice.subscription === 'object' &&
            'id' in invoice.subscription
          ? (invoice.subscription as { id: string }).id
          : null;
    return raw;
  }

  private async resolveOrgFromCustomer(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<string | null> {
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (!id) {
      return null;
    }
    const row = await this.stripeCustomers.findByStripeCustomerId(id);
    return row?.organizationId ?? null;
  }

  private async resolveCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<string | null> {
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (!id) {
      return null;
    }
    const row = await this.stripeCustomers.findByStripeCustomerId(id);
    return row?.customerId ?? null;
  }
}
