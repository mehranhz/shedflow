import { Injectable, Logger } from '@nestjs/common';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared/internalAuth';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BillingCustomerClient {
  private readonly logger = new Logger(BillingCustomerClient.name);

  constructor(private readonly config: ConfigService) {}

  async listPayments(customerIds: string[]): Promise<unknown[]> {
    const result = await this.post('/internal/customer/payments/list', {
      customerIds,
    });
    return Array.isArray(result) ? result : [];
  }

  async listInvoices(customerIds: string[]): Promise<unknown[]> {
    const result = await this.post('/internal/customer/invoices/list', {
      customerIds,
    });
    return Array.isArray(result) ? result : [];
  }

  async createPortalSession(input: {
    organizationId: string;
    customerId: string;
    invitee: { email: string; name: string };
    returnUrl: string;
    idempotencyKey?: string;
  }): Promise<{ url: string; mode: 'portal' | 'setup' } | null> {
    return (await this.post(
      '/internal/customer/portal-session',
      input,
      input.idempotencyKey,
    )) as { url: string; mode: 'portal' | 'setup' } | null;
  }

  async listMemberships(
    organizationId: string,
    customerId: string,
  ): Promise<unknown[]> {
    const result = await this.post('/internal/memberships/list', {
      organizationId,
      customerId,
    });
    return Array.isArray(result) ? result : [];
  }

  async setCancelAtPeriodEnd(input: {
    organizationId: string;
    customerId: string;
    subscriptionId: string;
    cancelAtPeriodEnd: boolean;
  }): Promise<unknown> {
    return this.post('/internal/memberships/cancel-at-period-end', input);
  }

  async createMembershipCheckout(input: Record<string, unknown>): Promise<{
    url: string;
  } | null> {
    return (await this.post(
      '/internal/membership-checkout-sessions',
      input,
    )) as { url: string } | null;
  }

  async createPackageCheckout(input: Record<string, unknown>): Promise<{
    url: string;
    paymentId: string;
  } | null> {
    return (await this.post(
      '/internal/package-checkout-sessions',
      input,
    )) as { url: string; paymentId: string } | null;
  }

  async listPackages(
    organizationId: string,
    customerId: string,
  ): Promise<unknown[]> {
    const result = await this.post('/internal/packages/list', {
      organizationId,
      customerId,
    });
    return Array.isArray(result) ? result : [];
  }

  async redeemGiftCard(input: {
    organizationId: string;
    customerId: string;
    code: string;
  }): Promise<unknown> {
    return this.post('/internal/gift-cards/redeem', input);
  }

  async getCreditBalance(
    organizationId: string,
    customerId: string,
  ): Promise<number> {
    // Prefer listing memberships which embeds balance; fallback 0.
    const memberships = (await this.listMemberships(
      organizationId,
      customerId,
    )) as Array<{ creditBalance?: number }>;
    if (memberships[0]?.creditBalance != null) {
      return memberships[0].creditBalance;
    }
    return 0;
  }

  private async post(
    path: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const base = this.config.getOrThrow<string>('BILLING_URL').replace(/\/$/, '');
    const body = JSON.stringify(input);
    const secret = this.config.getOrThrow<string>('INTERNAL_API_SECRET');
    const timestamp = internalTimestamp();
    const signature = signInternalRequest({
      secret,
      timestamp,
      method: 'POST',
      path,
      body,
    });

    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [INTERNAL_TIMESTAMP_HEADER]: timestamp,
          [INTERNAL_SIGNATURE_HEADER]: signature,
          ...(idempotencyKey
            ? { 'Idempotency-Key': idempotencyKey }
            : {}),
        },
        body,
      });
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `billing ${path} status=${response.status} body=${text.slice(0, 300)}`,
        );
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      }
      return (await response.json()) as unknown;
    } catch (error) {
      this.logger.warn(
        `billing unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
