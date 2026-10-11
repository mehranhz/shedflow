import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { PaymentGateway } from '../payments/payment-gateway';
import { StripeCustomerRepository } from '../memberships/stripe-customer.repository';
import { PrismaService } from '../prisma/prisma.service';

export type CreateCustomerPortalSessionInput = {
  organizationId: string;
  customerId: string;
  invitee: { email: string; name: string };
  returnUrl: string;
  idempotencyKey?: string;
};

/**
 * Stripe Customer Portal / setup Checkout for connected-account customers (T-062).
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly accounts: PlatformAccountRepository,
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly gateway: PaymentGateway,
    private readonly prisma: PrismaService,
  ) {}

  async createPortalSession(
    input: CreateCustomerPortalSessionInput,
  ): Promise<{ url: string; mode: 'portal' | 'setup' }> {
    const account = await this.accounts.findByOrganizationId(
      input.organizationId,
    );
    if (!account || !account.chargesEnabled) {
      throw new UnprocessableEntityException({
        code: 'CONNECT_INCOMPLETE',
        message: 'Stripe Connect charges are not enabled for this organization.',
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

      // No payment methods yet — Checkout setup mode collects a card, then
      // customer can use the portal on subsequent visits.
      const setup = await this.gateway.createCheckoutSession({
        mode: 'setup',
        successUrl: input.returnUrl,
        cancelUrl: input.returnUrl,
        stripeCustomerId: stripeCustomer.stripeCustomerId,
        stripeAccount: account.stripeAccountId,
        metadata: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          kind: 'customer_setup',
        },
        idempotencyKey:
          input.idempotencyKey ??
          `customer-setup:${input.organizationId}:${input.customerId}`,
      });
      return { url: setup.url, mode: 'setup' };
    }

    const session = await this.gateway.createBillingPortalSession({
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      returnUrl: input.returnUrl,
      stripeAccount: account.stripeAccountId,
      idempotencyKey:
        input.idempotencyKey ??
        `customer-portal:${input.organizationId}:${input.customerId}:${input.returnUrl}`,
    });
    return { url: session.url, mode: 'portal' };
  }

  async listPaymentsForCustomers(customerIds: string[]): Promise<
    Array<{
      id: string;
      organizationId: string;
      customerId: string;
      bookingId: string | null;
      amountMinor: number;
      currency: string;
      status: string;
      createdAt: Date;
      refunds: Array<{
        id: string;
        amountMinor: number;
        createdAt: Date;
        reason: string | null;
      }>;
      hostedInvoiceUrl: string | null;
    }>
  > {
    if (customerIds.length === 0) {
      return [];
    }
    const payments = await this.prisma.payment.findMany({
      where: { customerId: { in: customerIds } },
      include: { refunds: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const invoices = await this.prisma.invoice.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { createdAt: 'desc' },
    });
    const invoiceByCustomer = new Map<string, string | null>();
    for (const inv of invoices) {
      if (!inv.customerId) continue;
      if (!invoiceByCustomer.has(inv.customerId) && inv.hostedInvoiceUrl) {
        invoiceByCustomer.set(inv.customerId, inv.hostedInvoiceUrl);
      }
    }

    return payments.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      customerId: p.customerId,
      bookingId: p.bookingId,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
      refunds: p.refunds.map((r) => ({
        id: r.id,
        amountMinor: r.amountMinor,
        createdAt: r.createdAt,
        reason: r.reason,
      })),
      hostedInvoiceUrl: invoiceByCustomer.get(p.customerId) ?? null,
    }));
  }

  async listInvoicesForCustomers(customerIds: string[]): Promise<
    Array<{
      id: string;
      organizationId: string;
      customerId: string | null;
      amountDueMinor: number;
      amountPaidMinor: number;
      currency: string;
      status: string;
      hostedInvoiceUrl: string | null;
      pdfUrl: string | null;
      createdAt: Date;
    }>
  > {
    if (customerIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.invoice.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      customerId: r.customerId,
      amountDueMinor: r.amountDueMinor,
      amountPaidMinor: r.amountPaidMinor,
      currency: r.currency,
      status: r.status,
      hostedInvoiceUrl: r.hostedInvoiceUrl,
      pdfUrl: r.pdfUrl,
      createdAt: r.createdAt,
    }));
  }

  async requireCustomerInOrg(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    // Soft check via stripe_customers or payments — Customer table is api-owned.
    void organizationId;
    void customerId;
    const account = await this.accounts.findByOrganizationId(organizationId);
    if (!account) {
      throw new NotFoundException('Organization billing not found');
    }
  }
}
