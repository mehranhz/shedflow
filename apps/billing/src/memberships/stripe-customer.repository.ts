export type StripeCustomerRecord = {
  id: string;
  organizationId: string;
  customerId: string;
  stripeCustomerId: string;
};

export abstract class StripeCustomerRepository {
  abstract findByCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<StripeCustomerRecord | null>;

  abstract findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<StripeCustomerRecord | null>;

  abstract upsert(data: {
    organizationId: string;
    customerId: string;
    stripeCustomerId: string;
  }): Promise<StripeCustomerRecord>;
}
