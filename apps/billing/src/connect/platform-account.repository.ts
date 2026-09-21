export type PlatformAccount = {
  organizationId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePlatformAccountData = {
  organizationId: string;
  stripeAccountId: string;
};

export type PlatformAccountFlags = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export abstract class PlatformAccountRepository {
  abstract findByOrganizationId(
    organizationId: string,
  ): Promise<PlatformAccount | null>;

  abstract findByStripeAccountId(
    stripeAccountId: string,
  ): Promise<PlatformAccount | null>;

  abstract create(data: CreatePlatformAccountData): Promise<PlatformAccount>;

  abstract updateFlags(
    organizationId: string,
    flags: PlatformAccountFlags,
  ): Promise<PlatformAccount>;
}
