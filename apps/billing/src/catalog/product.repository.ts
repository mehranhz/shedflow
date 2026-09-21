export type CatalogProduct = {
  id: string;
  organizationId: string;
  name: string;
  type: 'ONE_TIME' | 'RECURRING';
  stripeProductId: string;
  creditGrantPerPeriod: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCatalogProductData = {
  organizationId: string;
  name: string;
  type: 'ONE_TIME' | 'RECURRING';
  stripeProductId: string;
  creditGrantPerPeriod: number;
};

export type UpdateCatalogProductData = {
  name?: string;
  isActive?: boolean;
  creditGrantPerPeriod?: number;
};

export abstract class ProductRepository {
  abstract findByOrganizationId(
    organizationId: string,
  ): Promise<CatalogProduct[]>;

  abstract findById(
    organizationId: string,
    productId: string,
  ): Promise<CatalogProduct | null>;

  abstract create(data: CreateCatalogProductData): Promise<CatalogProduct>;

  abstract update(
    organizationId: string,
    productId: string,
    data: UpdateCatalogProductData,
  ): Promise<CatalogProduct>;
}
