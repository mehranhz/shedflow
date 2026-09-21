import type { SubscriptionStatus } from '@shedflow/db';

export type SubscriptionRecord = {
  id: string;
  organizationId: string;
  customerId: string;
  productId: string;
  priceId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertSubscriptionData = {
  organizationId: string;
  customerId: string;
  productId: string;
  priceId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export abstract class SubscriptionRepository {
  abstract findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<SubscriptionRecord | null>;

  abstract findActiveForCustomer(
    organizationId: string,
    customerId: string,
    productId?: string,
  ): Promise<SubscriptionRecord | null>;

  abstract upsertByStripeId(
    data: UpsertSubscriptionData,
  ): Promise<SubscriptionRecord>;
}
