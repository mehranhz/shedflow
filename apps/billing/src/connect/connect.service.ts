import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MembershipStatus,
  PlatformPlan,
  Role,
} from '@shedflow/db';
import type Stripe from 'stripe';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PaymentGateway } from '../payments/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { isConnectCountry } from './connect.constants';
import {
  PlatformAccount,
  PlatformAccountRepository,
} from './platform-account.repository';

export type ConnectStatusResponse = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

@Injectable()
export class ConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: PlatformAccountRepository,
    private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  async onboard(
    orgId: string,
    user: AuthenticatedUser,
    country = 'US',
  ): Promise<{ url: string }> {
    await this.requireProBillingAdmin(orgId, user);
    if (!isConnectCountry(country)) {
      throw new BadRequestException({
        message:
          'Connect is not available in this country yet. Supported: US, CA, GB, AU, IE, DE, FR, NL, ES, IT.',
      });
    }

    const existing = await this.accounts.findByOrganizationId(orgId);
    const stripeAccountId =
      existing?.stripeAccountId ??
      (
        await this.gateway.createConnectAccount({
          id: orgId,
          email: user.email,
          country,
        })
      ).stripeAccountId;

    if (!existing) {
      await this.accounts.create({ organizationId: orgId, stripeAccountId });
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    return this.gateway.createAccountLink(
      stripeAccountId,
      `${appUrl}/dashboard/billing?connect=return`,
      `${appUrl}/dashboard/billing?connect=refresh`,
    );
  }

  async status(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<ConnectStatusResponse> {
    await this.requireProBillingAdmin(orgId, user);
    const account = await this.accounts.findByOrganizationId(orgId);
    if (!account) {
      return {
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    }
    return {
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      detailsSubmitted: account.detailsSubmitted,
    };
  }

  async dashboardLink(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    await this.requireProBillingAdmin(orgId, user);
    const account = await this.accounts.findByOrganizationId(orgId);
    if (!account || !account.detailsSubmitted) {
      throw new UnprocessableEntityException({
        code: 'CONNECT_INCOMPLETE',
        message: 'Finish Stripe Connect onboarding before opening the dashboard.',
      });
    }
    return this.gateway.createLoginLink(account.stripeAccountId);
  }

  async applyAccountUpdated(event: Stripe.Event): Promise<void> {
    if (event.type !== 'account.updated') {
      return;
    }
    const account = event.data.object as Stripe.Account;
    const flags = {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    };

    const existing =
      (await this.accounts.findByStripeAccountId(account.id)) ??
      (await this.accountFromMetadata(account));

    if (!existing) {
      return;
    }

    await this.accounts.updateFlags(existing.organizationId, flags);
  }

  private async accountFromMetadata(
    account: Stripe.Account,
  ): Promise<PlatformAccount | null> {
    const organizationId = account.metadata?.organizationId;
    if (!organizationId) {
      return null;
    }
    const existing = await this.accounts.findByOrganizationId(organizationId);
    if (existing) {
      return existing;
    }
    return this.accounts.create({
      organizationId,
      stripeAccountId: account.id,
    });
  }

  private async requireProBillingAdmin(
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
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
        message: 'Stripe Connect requires a Pro plan.',
      });
    }
  }
}
