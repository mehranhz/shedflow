export type RefundRecord = {
  id: string;
  paymentId: string;
  amountMinor: number;
  stripeRefundId: string;
  reason: string | null;
  createdAt: Date;
};

export type CreateRefundData = {
  paymentId: string;
  amountMinor: number;
  stripeRefundId: string;
  reason?: string | null;
};

export abstract class RefundRepository {
  abstract create(data: CreateRefundData): Promise<RefundRecord>;

  abstract sumByPaymentId(paymentId: string): Promise<number>;

  abstract findByStripeRefundId(
    stripeRefundId: string,
  ): Promise<RefundRecord | null>;
}
