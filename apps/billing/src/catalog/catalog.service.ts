import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MembershipStatus,
  PlatformPlan,
  ProductType,
  Role,
} from '@shedflow/db';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PlatformAccountRepository } from '../connect/platform-account.repository';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogPrice, PriceRepository } from './price.repository';
import {
  CatalogProduct,
  ProductRepository,
} from './product.repository';

export type ProductResponse = CatalogProduct & { prices?: CatalogPrice[] };

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductRepository,
    private readonly prices: PriceRepository,
    private readonly accounts: PlatformAccountRepository,
    private readonly gateway: PaymentGateway,
  ) {}

  async listProducts(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<ProductResponse[]> {
    await this.requireProBillingAdmin(orgId, user);
    const rows = await this.products.findByOrganizationId(orgId);
    return Promise.all(
      rows.map(async (product) => ({
        ...product,
        prices: await this.prices.findByProductId(orgId, product.id),
      })),
    );
  }

  async createProduct(
    orgId: string,
    user: AuthenticatedUser,
    input: {
      name: string;
      type: 'ONE_TIME' | 'RECURRING';
      creditGrantPerPeriod?: number;
    },
  ): Promise<CatalogProduct> {
    const { org, account } = await this.requireConnectedProAdmin(orgId, user);
    void org;

    const creditGrantPerPeriod = input.creditGrantPerPeriod ?? 0;
    if (input.type === ProductType.ONE_TIME && creditGrantPerPeriod !== 0) {
      throw new BadRequestException({
        message: 'One-time products cannot grant credits',
        fieldErrors: {
          creditGrantPerPeriod: ['Must be 0 for ONE_TIME products'],
        },
      });
    }

    const stripe = await this.gateway.createProduct({
      name: input.name,
      stripeAccount: account.stripeAccountId,
      metadata: {
        organizationId: orgId,
        type: input.type,
      },
    });

    return this.products.create({
      organizationId: orgId,
      name: input.name,
      type: input.type,
      stripeProductId: stripe.id,
      creditGrantPerPeriod,
    });
  }

  async updateProduct(
    orgId: string,
    productId: string,
    user: AuthenticatedUser,
    input: {
      name?: string;
      isActive?: boolean;
      creditGrantPerPeriod?: number;
    },
  ): Promise<CatalogProduct> {
    const { account } = await this.requireConnectedProAdmin(orgId, user);
    const existing = await this.products.findById(orgId, productId);
    if (!existing) {
      throw new NotFoundException('Not found');
    }

    if (
      existing.type === ProductType.ONE_TIME &&
      input.creditGrantPerPeriod !== undefined &&
      input.creditGrantPerPeriod !== 0
    ) {
      throw new BadRequestException({
        message: 'One-time products cannot grant credits',
        fieldErrors: {
          creditGrantPerPeriod: ['Must be 0 for ONE_TIME products'],
        },
      });
    }

    const stripePatch: { active?: boolean; name?: string } = {};
    if (input.name !== undefined) {
      stripePatch.name = input.name;
    }
    if (input.isActive !== undefined) {
      stripePatch.active = input.isActive;
    }
    if (Object.keys(stripePatch).length > 0) {
      await this.gateway.updateProduct(
        existing.stripeProductId,
        stripePatch,
        account.stripeAccountId,
      );
    }

    return this.products.update(orgId, productId, {
      name: input.name,
      isActive: input.isActive,
      creditGrantPerPeriod: input.creditGrantPerPeriod,
    });
  }

  async createPrice(
    orgId: string,
    productId: string,
    user: AuthenticatedUser,
    input: {
      amountMinor: number;
      currency: string;
      interval?: 'month' | 'year';
    },
  ): Promise<CatalogPrice> {
    const { org, account } = await this.requireConnectedProAdmin(orgId, user);
    const product = await this.products.findById(orgId, productId);
    if (!product) {
      throw new NotFoundException('Not found');
    }

    const currency = input.currency.toUpperCase();
    if (currency !== org.currency.toUpperCase()) {
      throw new BadRequestException({
        message: `Price currency must match organization currency (${org.currency})`,
        fieldErrors: {
          currency: [`Must be ${org.currency}`],
        },
      });
    }

    if (product.type === ProductType.ONE_TIME && input.interval) {
      throw new BadRequestException({
        message: 'One-time products cannot have a recurring interval',
        fieldErrors: { interval: ['Must be omitted for ONE_TIME products'] },
      });
    }
    if (product.type === ProductType.RECURRING && !input.interval) {
      throw new BadRequestException({
        message: 'Recurring products require a billing interval',
        fieldErrors: { interval: ['Must be month or year'] },
      });
    }

    const stripe = await this.gateway.createPrice({
      productId: product.stripeProductId,
      currency,
      unitAmount: input.amountMinor,
      interval: input.interval,
      stripeAccount: account.stripeAccountId,
      metadata: {
        organizationId: orgId,
        productId: product.id,
      },
    });

    return this.prices.create({
      productId: product.id,
      organizationId: orgId,
      amountMinor: input.amountMinor,
      currency,
      interval: input.interval ?? null,
      stripePriceId: stripe.id,
    });
  }

  private async requireConnectedProAdmin(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<{
    org: { id: string; currency: string; platformPlan: PlatformPlan };
    account: { stripeAccountId: string };
  }> {
    const org = await this.requireProBillingAdmin(orgId, user);
    const account = await this.accounts.findByOrganizationId(orgId);
    if (!account) {
      throw new UnprocessableEntityException({
        code: 'CONNECT_INCOMPLETE',
        message: 'Finish Stripe Connect onboarding before managing products.',
      });
    }
    return { org, account };
  }

  private async requireProBillingAdmin(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<{ id: string; currency: string; platformPlan: PlatformPlan }> {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Not found');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Not found');
    }
    if (membership.role !== Role.OWNER && membership.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient role',
      });
    }
    if (org.platformPlan !== PlatformPlan.PRO) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message: 'Product catalog requires a Pro plan.',
      });
    }
    return {
      id: org.id,
      currency: org.currency,
      platformPlan: org.platformPlan,
    };
  }
}
