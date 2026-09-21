import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { ConnectService } from '../connect/connect.service';
import { CheckoutService } from '../checkout/checkout.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MembershipsService } from '../memberships/memberships.service';
import { PlatformBillingService } from '../platform/platform-billing.service';
import { RefundsService } from '../refunds/refunds.service';
import { StripeEventRepository } from '../stripe-events/stripe-event.repository';

@Injectable()
export class StripeWebhooksService {
  constructor(
    private readonly events: StripeEventRepository,
    private readonly connect: ConnectService,
    private readonly checkout: CheckoutService,
    private readonly memberships: MembershipsService,
    private readonly invoices: InvoicesService,
    private readonly refunds: RefundsService,
    private readonly platform: PlatformBillingService,
  ) {}

  async handleEvent(event: Stripe.Event): Promise<{ received: true }> {
    const stored = await this.events.tryInsert(event.id, event.type, event);
    if (stored.processedAt) {
      return { received: true };
    }

    switch (event.type) {
      case 'account.updated':
        await this.connect.applyAccountUpdated(event);
        break;
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === 'platform') {
          await this.platform.applyCheckoutCompleted(session);
        } else {
          await this.checkout.applyCheckoutCompleted(session);
        }
        break;
      }
      case 'checkout.session.expired':
        await this.checkout.applyCheckoutExpired(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'payment_intent.payment_failed':
        await this.checkout.applyPaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.kind === 'platform') {
          await this.platform.applySubscriptionEvent(subscription);
        } else {
          await this.memberships.applySubscriptionEvent(subscription);
        }
        break;
      }
      case 'invoice.paid':
        await this.invoices.upsertFromStripe(
          event.data.object as Stripe.Invoice,
        );
        await this.memberships.applyInvoicePaid(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.finalized':
        await this.invoices.upsertFromStripe(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.payment_failed':
        await this.invoices.applyPaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        await this.memberships.applyInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'charge.refunded':
        await this.refunds.applyChargeRefunded(
          event.data.object as Stripe.Charge,
        );
        break;
      default:
        break;
    }

    await this.events.markProcessed(event.id);
    return { received: true };
  }
}
