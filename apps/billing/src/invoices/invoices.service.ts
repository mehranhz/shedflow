import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { BillingOutbox } from '../checkout/billing-outbox';
import { StripeCustomerRepository } from '../memberships/stripe-customer.repository';
import { SubscriptionRepository } from '../memberships/subscription.repository';
import { InvoiceRepository } from './invoice.repository';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly outbox: BillingOutbox,
  ) {}

  async upsertFromStripe(invoice: Stripe.Invoice): Promise<void> {
    const organizationId = await this.resolveOrganizationId(invoice);
    if (!organizationId) {
      return;
    }

    const customerId = await this.resolveCustomerId(invoice);
    const currency = (invoice.currency ?? 'usd').toUpperCase();

    await this.invoices.upsertByStripeId({
      organizationId,
      customerId,
      stripeInvoiceId: invoice.id,
      amountDueMinor: invoice.amount_due ?? 0,
      amountPaidMinor: invoice.amount_paid ?? 0,
      currency,
      status: invoice.status ?? 'open',
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
    });
  }

  async applyPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    await this.upsertFromStripe(invoice);
    const organizationId = await this.resolveOrganizationId(invoice);
    if (!organizationId) {
      return;
    }
    const customerId = await this.resolveCustomerId(invoice);
    await this.outbox.emit(
      'invoice.payment_failed',
      {
        stripeInvoiceId: invoice.id,
        organizationId,
        customerId,
        amountDueMinor: invoice.amount_due ?? 0,
        currency: (invoice.currency ?? 'usd').toUpperCase(),
      },
      organizationId,
    );
  }

  private async resolveOrganizationId(
    invoice: Stripe.Invoice,
  ): Promise<string | null> {
    if (invoice.metadata?.organizationId) {
      return invoice.metadata.organizationId;
    }
    const stripeSubId = this.subscriptionId(invoice);
    if (stripeSubId) {
      const sub =
        await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
      if (sub) {
        return sub.organizationId;
      }
    }
    const stripeCustomerId = this.customerId(invoice);
    if (stripeCustomerId) {
      const row =
        await this.stripeCustomers.findByStripeCustomerId(stripeCustomerId);
      return row?.organizationId ?? null;
    }
    return null;
  }

  private async resolveCustomerId(
    invoice: Stripe.Invoice,
  ): Promise<string | null> {
    if (invoice.metadata?.customerId) {
      return invoice.metadata.customerId;
    }
    const stripeSubId = this.subscriptionId(invoice);
    if (stripeSubId) {
      const sub =
        await this.subscriptions.findByStripeSubscriptionId(stripeSubId);
      if (sub) {
        return sub.customerId;
      }
    }
    const stripeCustomerId = this.customerId(invoice);
    if (stripeCustomerId) {
      const row =
        await this.stripeCustomers.findByStripeCustomerId(stripeCustomerId);
      return row?.customerId ?? null;
    }
    return null;
  }

  private subscriptionId(invoice: Stripe.Invoice): string | null {
    const raw = invoice.subscription;
    if (typeof raw === 'string') {
      return raw;
    }
    if (raw && typeof raw === 'object' && 'id' in raw) {
      return (raw as { id: string }).id;
    }
    return null;
  }

  private customerId(invoice: Stripe.Invoice): string | null {
    const raw = invoice.customer;
    if (typeof raw === 'string') {
      return raw;
    }
    if (raw && typeof raw === 'object' && 'id' in raw) {
      return (raw as { id: string }).id;
    }
    return null;
  }
}
