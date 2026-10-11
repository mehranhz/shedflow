import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURE_FLAGS, isEnabled } from '@shedflow/shared';
import { AuthenticatedUser } from '../users/user';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCustomerClient } from './billing-customer.client';
import { LinkedCustomersService } from './linked-customers.service';

@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly linked: LinkedCustomersService,
    private readonly billing: BillingCustomerClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listPayments(user: AuthenticatedUser, organizationId?: string) {
    const { customerIds } = await this.linked.resolveScopedIds(
      user.id,
      organizationId,
    );
    const rows = (await this.billing.listPayments(customerIds)) as Array<{
      id: string;
      organizationId: string;
      customerId: string;
      bookingId: string | null;
      amountMinor: number;
      currency: string;
      status: string;
      createdAt: string | Date;
      refunds: Array<{
        id: string;
        amountMinor: number;
        createdAt: string | Date;
        reason: string | null;
      }>;
      hostedInvoiceUrl: string | null;
    }>;

    const bookingIds = rows
      .map((r) => r.bookingId)
      .filter((id): id is string => Boolean(id));
    const bookings =
      bookingIds.length > 0
        ? await this.prisma.booking.findMany({
            where: { id: { in: bookingIds } },
            select: { id: true, uid: true },
          })
        : [];
    const uidById = new Map(bookings.map((b) => [b.id, b.uid]));

    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      customerId: r.customerId,
      amountMinor: r.amountMinor,
      currency: r.currency,
      status: r.status,
      createdAt: r.createdAt,
      bookingUid: r.bookingId ? (uidById.get(r.bookingId) ?? null) : null,
      receiptUrl: r.hostedInvoiceUrl,
      refunds: (r.refunds ?? []).map((ref) => ({
        id: ref.id,
        amountMinor: ref.amountMinor,
        createdAt: ref.createdAt,
        reason: ref.reason,
        // Visibility only — customers cannot self-refund.
      })),
    }));
  }

  async listInvoices(user: AuthenticatedUser, organizationId?: string) {
    const { customerIds } = await this.linked.resolveScopedIds(
      user.id,
      organizationId,
    );
    return this.billing.listInvoices(customerIds);
  }

  async createPortalSession(
    user: AuthenticatedUser,
    input: { organizationId: string; returnUrl: string },
    idempotencyKey?: string,
  ) {
    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      input.organizationId,
    );
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_LINKED',
        message: 'No customer linked for this organization',
      });
    }

    const result = await this.billing.createPortalSession({
      organizationId: input.organizationId,
      customerId: customer.id,
      invitee: { email: customer.email, name: customer.name },
      returnUrl: input.returnUrl,
      idempotencyKey,
    });

    if (!result || !('url' in result) || !result.url) {
      if (
        result &&
        typeof result === 'object' &&
        'code' in (result as object) &&
        (result as { code?: string }).code === 'CONNECT_INCOMPLETE'
      ) {
        throw new UnprocessableEntityException({
          code: 'CONNECT_INCOMPLETE',
          message:
            'This business has not finished payment setup. Cards cannot be managed yet.',
        });
      }
      throw new UnprocessableEntityException({
        code: 'PORTAL_UNAVAILABLE',
        message: 'Unable to open payment methods portal',
      });
    }
    return result;
  }

  async listMemberships(user: AuthenticatedUser, organizationId?: string) {
    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      organizationId,
    );
    const all = [];
    for (const c of customers) {
      const rows = (await this.billing.listMemberships(
        c.organizationId,
        c.id,
      )) as unknown[];
      const packages = (await this.billing.listPackages(
        c.organizationId,
        c.id,
      )) as unknown[];
      all.push({
        organizationId: c.organizationId,
        customerId: c.id,
        memberships: rows,
        packages,
      });
    }
    return all;
  }

  async cancelMembership(
    user: AuthenticatedUser,
    input: {
      organizationId: string;
      subscriptionId: string;
      cancelAtPeriodEnd: boolean;
    },
  ) {
    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      input.organizationId,
    );
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Customer not linked');
    }
    return this.billing.setCancelAtPeriodEnd({
      organizationId: input.organizationId,
      customerId: customer.id,
      subscriptionId: input.subscriptionId,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });
  }

  async subscribe(
    user: AuthenticatedUser,
    input: {
      organizationId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    },
  ) {
    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      input.organizationId,
    );
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Customer not linked');
    }
    return this.billing.createMembershipCheckout({
      organizationId: input.organizationId,
      customerId: customer.id,
      priceId: input.priceId,
      invitee: { email: customer.email, name: customer.name },
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
  }

  async purchasePackage(
    user: AuthenticatedUser,
    input: {
      organizationId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
      expiresAt?: string | null;
    },
  ) {
    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      input.organizationId,
    );
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Customer not linked');
    }
    return this.billing.createPackageCheckout({
      organizationId: input.organizationId,
      customerId: customer.id,
      priceId: input.priceId,
      invitee: { email: customer.email, name: customer.name },
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: input.expiresAt,
    });
  }

  async redeemGiftCard(
    user: AuthenticatedUser,
    input: { organizationId: string; code: string },
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
    });
    if (
      !isEnabled(
        FEATURE_FLAGS.customerGiftCards,
        org,
        this.config.get<string>('FLAGS'),
      )
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Gift cards are not enabled',
      });
    }

    const { customers } = await this.linked.resolveScopedIds(
      user.id,
      input.organizationId,
    );
    const customer = customers[0];
    if (!customer) {
      throw new NotFoundException('Customer not linked');
    }

    const result = await this.billing.redeemGiftCard({
      organizationId: input.organizationId,
      customerId: customer.id,
      code: input.code,
    });
    if (
      result &&
      typeof result === 'object' &&
      'statusCode' in (result as object)
    ) {
      const status = (result as { statusCode?: number }).statusCode;
      if (status === 404) {
        throw new NotFoundException(result);
      }
      if (status === 422) {
        throw new UnprocessableEntityException(result);
      }
    }
    if (!result || (typeof result === 'object' && !('balance' in result))) {
      throw new ForbiddenException({
        message: 'Unable to redeem gift card',
      });
    }
    return result;
  }
}
