import type { PaymentStatus } from '@shedflow/db';

export type PaymentRecord = {
  id: string;
  organizationId: string;
  customerId: string;
  bookingId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  amountMinor: number;
  currency: string;
  applicationFeeMinor: number;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentData = {
  organizationId: string;
  customerId: string;
  bookingId: string;
  stripeCheckoutSessionId: string;
  amountMinor: number;
  currency: string;
  applicationFeeMinor: number;
  status: PaymentStatus;
};

export abstract class PaymentRepository {
  abstract findById(id: string): Promise<PaymentRecord | null>;

  abstract findByBookingId(bookingId: string): Promise<PaymentRecord | null>;

  abstract findByCheckoutSessionId(
    sessionId: string,
  ): Promise<PaymentRecord | null>;

  abstract create(data: CreatePaymentData): Promise<PaymentRecord>;

  abstract updateStatus(
    id: string,
    status: PaymentStatus,
    patch?: {
      stripePaymentIntentId?: string | null;
      stripeCheckoutSessionId?: string | null;
    },
  ): Promise<PaymentRecord>;
}
