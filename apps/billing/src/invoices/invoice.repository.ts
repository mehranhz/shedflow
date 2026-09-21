export type InvoiceRecord = {
  id: string;
  organizationId: string;
  customerId: string | null;
  stripeInvoiceId: string;
  amountDueMinor: number;
  amountPaidMinor: number;
  currency: string;
  status: string;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  createdAt: Date;
};

export type UpsertInvoiceData = {
  organizationId: string;
  customerId?: string | null;
  stripeInvoiceId: string;
  amountDueMinor: number;
  amountPaidMinor: number;
  currency: string;
  status: string;
  hostedInvoiceUrl?: string | null;
  pdfUrl?: string | null;
};

export abstract class InvoiceRepository {
  abstract upsertByStripeId(data: UpsertInvoiceData): Promise<InvoiceRecord>;

  abstract findByStripeInvoiceId(
    stripeInvoiceId: string,
  ): Promise<InvoiceRecord | null>;
}
