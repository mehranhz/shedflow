import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@shedflow/db';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { PriceRepository } from '../catalog/price.repository';
import { PaymentGateway } from '../payments/payment-gateway';
import { ApiBookingsClient } from './api-bookings.client';
import { BillingOutbox } from './billing-outbox';
import { PaymentRecord, PaymentRepository } from './payment.repository';

export type CreateCheckoutSessionInput = {
  organizationId: string;
  bookingId: string;
  customerId: string;
  priceId: string;
  invitee: { email: string; name: string };
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly prices: PriceRepository,
    private readonly accounts: PlatformAccountRepository,
    private readonly gateway: PaymentGateway,
    private readonly outbox: BillingOutbox,
    private readonly apiBookings: ApiBookingsClient,
    private readonly config: ConfigService,
  ) {}

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
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

    const existing = await this.payments.findByBookingId(input.bookingId);
    if (existing?.status === PaymentStatus.SUCCEEDED) {
      throw new BadRequestException({
        message: 'Booking is already paid',
      });
    }
    if (
      existing?.status === PaymentStatus.REQUIRES_PAYMENT &&
      existing.stripeCheckoutSessionId
    ) {
      // Re-create with the same idempotency key so Stripe returns the same session.
    }

    const feeBps = this.config.get<number>('STRIPE_PLATFORM_FEE_BPS') ?? 200;
    const applicationFeeMinor = Math.floor(
      (price.amountMinor * feeBps) / 10_000,
    );
    const expiresAtUnix = Math.floor(new Date(input.expiresAt).getTime() / 1000);
    if (!Number.isFinite(expiresAtUnix)) {
      throw new BadRequestException({
        fieldErrors: { expiresAt: ['Invalid expiresAt'] },
      });
    }

    const session = await this.gateway.createCheckoutSession({
      mode: 'payment',
      stripePriceId: price.stripePriceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.invitee.email,
      stripeAccount: account.stripeAccountId,
      applicationFeeAmount: applicationFeeMinor,
      metadata: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        kind: 'booking',
      },
      expiresAtUnix,
      idempotencyKey: `checkout:${input.bookingId}`,
    });

    let payment: PaymentRecord;
    if (existing && existing.status === PaymentStatus.REQUIRES_PAYMENT) {
      payment = await this.payments.updateStatus(
        existing.id,
        PaymentStatus.REQUIRES_PAYMENT,
        { stripeCheckoutSessionId: session.id },
      );
    } else {
      payment = await this.payments.create({
        organizationId: input.organizationId,
        customerId: input.customerId,
        bookingId: input.bookingId,
        stripeCheckoutSessionId: session.id,
        amountMinor: price.amountMinor,
        currency: price.currency,
        applicationFeeMinor,
        status: PaymentStatus.REQUIRES_PAYMENT,
      });
    }

    return { url: session.url, paymentId: payment.id };
  }

  async applyCheckoutCompleted(session: {
    id: string;
    payment_status?: string | null;
    payment_intent?: string | { id?: string } | null;
    metadata?: Record<string, string> | null;
  }): Promise<void> {
    if (session.metadata?.kind !== 'booking') {
      return;
    }
    if (session.payment_status !== 'paid') {
      return;
    }

    const payment =
      (await this.payments.findByCheckoutSessionId(session.id)) ??
      (session.metadata.bookingId
        ? await this.payments.findByBookingId(session.metadata.bookingId)
        : null);
    if (!payment) {
      return;
    }
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return;
    }

    const intentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.payments.updateStatus(payment.id, PaymentStatus.SUCCEEDED, {
      stripePaymentIntentId: intentId,
    });

    const bookingId = payment.bookingId ?? session.metadata.bookingId;
    await this.outbox.emit(
      DOMAIN_EVENTS.PaymentSucceeded,
      {
        paymentId: payment.id,
        bookingId,
        organizationId: payment.organizationId,
        customerId: payment.customerId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      },
      payment.organizationId,
    );

    if (bookingId) {
      await this.apiBookings.confirmBooking(bookingId);
    }
  }

  async applyCheckoutExpired(session: {
    id: string;
    metadata?: Record<string, string> | null;
  }): Promise<void> {
    if (session.metadata?.kind !== 'booking') {
      return;
    }

    const payment =
      (await this.payments.findByCheckoutSessionId(session.id)) ??
      (session.metadata.bookingId
        ? await this.payments.findByBookingId(session.metadata.bookingId)
        : null);
    if (!payment) {
      return;
    }
    if (
      payment.status === PaymentStatus.SUCCEEDED ||
      payment.status === PaymentStatus.CANCELED
    ) {
      return;
    }

    await this.payments.updateStatus(payment.id, PaymentStatus.CANCELED);
    const bookingId = payment.bookingId ?? session.metadata.bookingId;
    await this.outbox.emit(
      DOMAIN_EVENTS.PaymentExpired,
      {
        paymentId: payment.id,
        bookingId,
        organizationId: payment.organizationId,
      },
      payment.organizationId,
    );
    if (bookingId) {
      await this.apiBookings.expireBooking(bookingId);
    }
  }

  async applyPaymentIntentFailed(intent: {
    id: string;
    metadata?: Record<string, string> | null;
  }): Promise<void> {
    const bookingId = intent.metadata?.bookingId;
    if (!bookingId || intent.metadata?.kind !== 'booking') {
      return;
    }
    const payment = await this.payments.findByBookingId(bookingId);
    if (!payment || payment.status === PaymentStatus.SUCCEEDED) {
      return;
    }
    await this.payments.updateStatus(payment.id, PaymentStatus.FAILED, {
      stripePaymentIntentId: intent.id,
    });
    await this.outbox.emit(
      DOMAIN_EVENTS.PaymentFailed,
      {
        paymentId: payment.id,
        bookingId,
        organizationId: payment.organizationId,
        reason: 'Payment failed',
      },
      payment.organizationId,
    );
  }
}
