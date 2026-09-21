import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Role } from '@shedflow/db';
import type Stripe from 'stripe';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { ApiOrganizationsClient } from './api-organizations.client';

export type PlatformCheckoutInput = {
  interval: 'month' | 'year';
};

@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly apiOrgs: ApiOrganizationsClient,
    private readonly config: ConfigService,
  ) {}

  async checkout(
    orgId: string,
    user: AuthenticatedUser,
    input: PlatformCheckoutInput,
  ): Promise<{ url: string }> {
    await this.requireOwnerOrAdmin(orgId, user);

    const priceId =
      input.interval === 'year'
        ? this.config.get<string>('STRIPE_PRICE_PRO_YEARLY')
        : this.config.get<string>('STRIPE_PRICE_PRO_MONTHLY');
    if (!priceId) {
      throw new UnprocessableEntityException({
        message: `Missing Stripe price for interval=${input.interval}`,
      });
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Not found');
    }

    const appUrl = this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '');
    const session = await this.gateway.createCheckoutSession({
      mode: 'subscription',
      stripePriceId: priceId,
      successUrl: `${appUrl}/dashboard/billing?upgrade=success`,
      cancelUrl: `${appUrl}/dashboard/billing?upgrade=cancel`,
      customerEmail: org.platformStripeCustomerId ? undefined : user.email,
      stripeCustomerId: org.platformStripeCustomerId ?? undefined,
      clientReferenceId: orgId,
      metadata: {
        kind: 'platform',
        organizationId: orgId,
      },
      idempotencyKey: `platform:${orgId}:${input.interval}`,
    });

    return { url: session.url };
  }

  async portal(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    await this.requireOwnerOrAdmin(orgId, user);

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Not found');
    }
    if (!org.platformStripeCustomerId) {
      throw new NotFoundException({
        message: 'No Stripe customer for this organization',
      });
    }

    const appUrl = this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '');
    return this.gateway.createBillingPortalSession({
      stripeCustomerId: org.platformStripeCustomerId,
      returnUrl: `${appUrl}/dashboard/billing`,
    });
  }

  async applySubscriptionEvent(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    if (subscription.metadata?.kind !== 'platform') {
      return;
    }

    let orgId = subscription.metadata.organizationId ?? '';
    if (!orgId) {
      const bySub = await this.prisma.organization.findFirst({
        where: { platformStripeSubscriptionId: subscription.id },
      });
      orgId = bySub?.id ?? '';
    }
    if (!orgId) {
      return;
    }

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer && 'id' in subscription.customer
          ? subscription.customer.id
          : null;

    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;

    // Remain PRO while cancel_at_period_end until deleted/canceled/unpaid.
    let platformPlan: 'FREE' | 'PRO' = 'FREE';
    if (status === 'active' || status === 'trialing') {
      platformPlan = 'PRO';
    } else if (
      cancelAtPeriodEnd &&
      status !== 'canceled' &&
      status !== 'unpaid' &&
      status !== 'incomplete_expired'
    ) {
      platformPlan = 'PRO';
    }
    if (status === 'canceled' || status === 'unpaid') {
      platformPlan = 'FREE';
    }

    await this.apiOrgs.updatePlan(orgId, {
      platformPlan,
      platformStripeCustomerId: customerId,
      platformStripeSubscriptionId: subscription.id,
    });

    if (customerId) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          platformStripeCustomerId: customerId,
          platformStripeSubscriptionId: subscription.id,
        },
      });
    }
  }

  async applyCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.metadata?.kind !== 'platform') {
      return;
    }
    const orgId =
      session.metadata.organizationId ?? session.client_reference_id ?? null;
    if (!orgId) {
      return;
    }
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer && 'id' in session.customer
          ? session.customer.id
          : null;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription && 'id' in session.subscription
          ? session.subscription.id
          : null;

    if (customerId || subscriptionId) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(customerId
            ? { platformStripeCustomerId: customerId }
            : {}),
          ...(subscriptionId
            ? { platformStripeSubscriptionId: subscriptionId }
            : {}),
        },
      });
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      await this.apiOrgs.updatePlan(orgId, {
        platformPlan: 'PRO',
        platformStripeCustomerId: customerId,
        platformStripeSubscriptionId: subscriptionId,
      });
    }
  }

  private async requireOwnerOrAdmin(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Not found');
    }
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (
      !membership ||
      (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only OWNER or ADMIN can manage platform billing',
      });
    }
  }
}
