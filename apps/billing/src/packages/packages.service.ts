import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditReason, PaymentStatus, ProductType } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { PriceRepository } from '../catalog/price.repository';
import { ProductRepository } from '../catalog/product.repository';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { BillingOutbox } from '../checkout/billing-outbox';
import { PaymentRepository } from '../checkout/payment.repository';
import { PaymentGateway } from '../payments/payment-gateway';
import { StripeCustomerRepository } from '../memberships/stripe-customer.repository';
import { PrismaService } from '../prisma/prisma.service';

export type CreatePackageCheckoutInput = {
  organizationId: string;
  customerId: string;
  priceId: string;
  invitee: { email: string; name: string };
  successUrl: string;
  cancelUrl: string;
  /** Optional package expiry (ISO). */
  expiresAt?: string | null;
};

@Injectable()
export class PackagesService {
  constructor(
    private readonly accounts: PlatformAccountRepository,
    private readonly products: ProductRepository,
    private readonly prices: PriceRepository,
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly outbox: BillingOutbox,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createCheckoutSession(
    input: CreatePackageCheckoutInput,
  ): Promise<{ url: string; paymentId: string }> {
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
    if (!product || product.type !== ProductType.PACKAGE) {
      throw new UnprocessableEntityException({
        message: 'Package checkout requires a PACKAGE product price',
      });
    }
    if (product.creditGrantPerPeriod <= 0) {
      throw new UnprocessableEntityException({
        message: 'Package must grant at least 1 credit',
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
    const applicationFeeMinor = Math.floor(
      (price.amountMinor * feeBps) / 10_000,
    );

    const session = await this.gateway.createCheckoutSession({
      mode: 'payment',
      stripePriceId: price.stripePriceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      stripeCustomerId: stripeCustomer.stripeCustomerId,
      stripeAccount: account.stripeAccountId,
      applicationFeeAmount: applicationFeeMinor,
      metadata: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        productId: product.id,
        priceId: price.id,
        kind: 'package',
        credits: String(product.creditGrantPerPeriod),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
      idempotencyKey: `package:${input.organizationId}:${input.customerId}:${price.id}`,
    });

    const payment = await this.payments.create({
      organizationId: input.organizationId,
      customerId: input.customerId,
      bookingId: null,
      stripeCheckoutSessionId: session.id,
      amountMinor: price.amountMinor,
      currency: price.currency,
      applicationFeeMinor,
      status: PaymentStatus.REQUIRES_PAYMENT,
    });

    return { url: session.url, paymentId: payment.id };
  }

  async applyCheckoutCompleted(session: {
    id: string;
    payment_status?: string | null;
    payment_intent?: string | { id?: string } | null;
    metadata?: Record<string, string> | null;
  }): Promise<void> {
    if (session.metadata?.kind !== 'package') {
      return;
    }
    if (session.payment_status !== 'paid') {
      return;
    }

    const organizationId = session.metadata.organizationId;
    const customerId = session.metadata.customerId;
    const productId = session.metadata.productId;
    const credits = Number(session.metadata.credits ?? '0');
    if (!organizationId || !customerId || !productId || credits <= 0) {
      return;
    }

    const payment = await this.payments.findByCheckoutSessionId(session.id);
    if (!payment || payment.status === PaymentStatus.SUCCEEDED) {
      return;
    }

    const intentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.payments.updateStatus(payment.id, PaymentStatus.SUCCEEDED, {
      stripePaymentIntentId: intentId,
    });

    const expiresAt = session.metadata.expiresAt
      ? new Date(session.metadata.expiresAt)
      : null;

    await this.grantPackage({
      organizationId,
      customerId,
      productId,
      paymentId: payment.id,
      credits,
      expiresAt:
        expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
    });

    await this.outbox.emit(
      DOMAIN_EVENTS.PaymentSucceeded,
      {
        paymentId: payment.id,
        organizationId,
        customerId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        kind: 'package',
      },
      organizationId,
    );
  }

  async grantPackage(input: {
    organizationId: string;
    customerId: string;
    productId: string;
    paymentId?: string | null;
    credits: number;
    expiresAt?: Date | null;
  }): Promise<{ balance: number; packagePurchaseId: string }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.creditBalance.upsert({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
        create: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          balance: input.credits,
        },
        update: { balance: { increment: input.credits } },
      });

      const row = await tx.creditBalance.findUniqueOrThrow({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          delta: input.credits,
          balanceAfter: row.balance,
          reason: CreditReason.PACKAGE_GRANT,
          periodEnd: input.expiresAt ?? undefined,
        },
      });

      const purchase = await tx.packagePurchase.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          productId: input.productId,
          paymentId: input.paymentId ?? null,
          creditsTotal: input.credits,
          creditsRemaining: input.credits,
          expiresAt: input.expiresAt ?? null,
        },
      });

      return { balance: row.balance, packagePurchaseId: purchase.id };
    });
  }

  /**
   * Consume package credits (decrements package_purchases_t064 + credit_balances).
   * Throws PACKAGE_EXPIRED when only expired package credits remain.
   */
  async consumePackageCredits(input: {
    organizationId: string;
    customerId: string;
    bookingId: string;
    cost: number;
  }): Promise<{ balance: number }> {
    if (input.cost <= 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'cost must be positive',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const active = await tx.packagePurchase.findFirst({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          creditsRemaining: { gte: input.cost },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!active) {
        const expiredWithCredits = await tx.packagePurchase.findFirst({
          where: {
            organizationId: input.organizationId,
            customerId: input.customerId,
            creditsRemaining: { gt: 0 },
            expiresAt: { lte: now },
          },
        });
        if (expiredWithCredits) {
          throw new UnprocessableEntityException({
            code: 'PACKAGE_EXPIRED',
            message: 'Package credits have expired',
          });
        }
        throw new UnprocessableEntityException({
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient package credits',
        });
      }

      await tx.packagePurchase.update({
        where: { id: active.id },
        data: { creditsRemaining: { decrement: input.cost } },
      });

      const updated = await tx.$executeRaw`
        UPDATE credit_balances
        SET balance = balance - ${input.cost}
        WHERE organization_id = ${input.organizationId}::uuid
          AND customer_id = ${input.customerId}::uuid
          AND balance >= ${input.cost}
      `;
      if (updated === 0) {
        throw new UnprocessableEntityException({
          code: 'INSUFFICIENT_CREDITS',
          message: 'Insufficient credits',
        });
      }

      const row = await tx.creditBalance.findUniqueOrThrow({
        where: {
          organizationId_customerId: {
            organizationId: input.organizationId,
            customerId: input.customerId,
          },
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          bookingId: input.bookingId,
          delta: -input.cost,
          balanceAfter: row.balance,
          reason: CreditReason.CONSUME,
        },
      });

      return { balance: row.balance };
    });
  }

  async listForCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<
    Array<{
      id: string;
      productId: string;
      creditsTotal: number;
      creditsRemaining: number;
      expiresAt: Date | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.prisma.packagePurchase.findMany({
      where: { organizationId, customerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      creditsTotal: r.creditsTotal,
      creditsRemaining: r.creditsRemaining,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }
}
