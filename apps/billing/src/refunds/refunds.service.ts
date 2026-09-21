import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MembershipStatus,
  PaymentStatus,
  PlatformPlan,
  Role,
} from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import type Stripe from 'stripe';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BillingOutbox } from '../checkout/billing-outbox';
import { PaymentRepository } from '../checkout/payment.repository';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RefundRepository } from './refund.repository';

export type CreateRefundInput = {
  amountMinor?: number;
  reason?: string;
};

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentRepository,
    private readonly refunds: RefundRepository,
    private readonly accounts: PlatformAccountRepository,
    private readonly gateway: PaymentGateway,
    private readonly outbox: BillingOutbox,
  ) {}

  async create(
    orgId: string,
    paymentId: string,
    user: AuthenticatedUser,
    input: CreateRefundInput,
  ) {
    await this.requireBillingAdmin(orgId, user);

    const payment = await this.payments.findById(paymentId);
    if (!payment || payment.organizationId !== orgId) {
      throw new NotFoundException('Payment not found');
    }
    if (
      payment.status !== PaymentStatus.SUCCEEDED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new UnprocessableEntityException({
        message: 'Only succeeded payments can be refunded',
      });
    }
    if (!payment.stripePaymentIntentId) {
      throw new UnprocessableEntityException({
        message: 'Payment has no Stripe payment intent',
      });
    }

    const alreadyRefunded = await this.refunds.sumByPaymentId(payment.id);
    const remaining = payment.amountMinor - alreadyRefunded;
    if (remaining <= 0) {
      throw new UnprocessableEntityException({
        message: 'Payment is already fully refunded',
      });
    }

    const amountMinor = input.amountMinor ?? remaining;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestException({
        fieldErrors: { amountMinor: ['Must be a positive integer'] },
      });
    }
    if (amountMinor > remaining) {
      throw new BadRequestException({
        fieldErrors: {
          amountMinor: [`Cannot exceed remaining ${remaining}`],
        },
      });
    }

    const account = await this.accounts.findByOrganizationId(orgId);
    if (!account?.chargesEnabled) {
      throw new UnprocessableEntityException({
        code: 'CONNECT_INCOMPLETE',
        message: 'Stripe Connect charges are not enabled.',
      });
    }

    const stripeRefund = await this.gateway.createRefund(
      payment.stripePaymentIntentId,
      amountMinor,
      input.reason,
      account.stripeAccountId,
    );

    const refund = await this.refunds.create({
      paymentId: payment.id,
      amountMinor,
      stripeRefundId: stripeRefund.id,
      reason: input.reason ?? null,
    });

    const totalRefunded = alreadyRefunded + amountMinor;
    const status =
      totalRefunded >= payment.amountMinor
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    const updated = await this.payments.updateStatus(payment.id, status);

    await this.outbox.emit(
      DOMAIN_EVENTS.PaymentRefunded,
      {
        paymentId: payment.id,
        refundId: refund.id,
        bookingId: payment.bookingId,
        organizationId: payment.organizationId,
        customerId: payment.customerId,
        amountMinor,
        totalRefunded,
        status,
      },
      payment.organizationId,
    );

    return { refund, payment: updated };
  }

  async applyChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const intentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!intentId) {
      return;
    }

    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: intentId },
    });
    if (!payment) {
      return;
    }

    const amountRefunded = charge.amount_refunded ?? 0;
    if (amountRefunded <= 0) {
      return;
    }

    // Persist Stripe refund ids from charge.refunds if present.
    const stripeRefunds = charge.refunds?.data ?? [];
    for (const sr of stripeRefunds) {
      const existing = await this.refunds.findByStripeRefundId(sr.id);
      if (existing) {
        continue;
      }
      await this.refunds.create({
        paymentId: payment.id,
        amountMinor: sr.amount,
        stripeRefundId: sr.id,
        reason: sr.reason ?? null,
      });
    }

    const status =
      amountRefunded >= payment.amountMinor
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    if (payment.status !== status) {
      await this.payments.updateStatus(payment.id, status);
      await this.outbox.emit(
        DOMAIN_EVENTS.PaymentRefunded,
        {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          organizationId: payment.organizationId,
          amountRefunded,
          status,
          source: 'charge.refunded',
        },
        payment.organizationId,
      );
    }
  }

  private async requireBillingAdmin(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Not found');
    }
    if (org.platformPlan !== PlatformPlan.PRO) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message: 'Refunds require a Pro plan',
      });
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (
      !membership ||
      (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only OWNER or ADMIN can issue refunds',
      });
    }
  }
}
