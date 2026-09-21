export type CatalogPrice = {
  id: string;
  productId: string;
  organizationId: string;
  amountMinor: number;
  currency: string;
  interval: string | null;
  intervalCount: number;
  stripePriceId: string;
  isActive: boolean;
  createdAt: Date;
};

export type CreateCatalogPriceData = {
  productId: string;
  organizationId: string;
  amountMinor: number;
  currency: string;
  interval: string | null;
  intervalCount?: number;
  stripePriceId: string;
};

export abstract class PriceRepository {
  abstract findByProductId(
    organizationId: string,
    productId: string,
  ): Promise<CatalogPrice[]>;

  abstract findById(
    organizationId: string,
    priceId: string,
  ): Promise<CatalogPrice | null>;

  abstract findByStripePriceId(
    organizationId: string,
    stripePriceId: string,
  ): Promise<CatalogPrice | null>;

  abstract create(data: CreateCatalogPriceData): Promise<CatalogPrice>;
}
