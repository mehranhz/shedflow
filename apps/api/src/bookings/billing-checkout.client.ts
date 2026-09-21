import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';

export type CheckoutSessionRequest = {
  organizationId: string;
  bookingId: string;
  customerId: string;
  priceId: string;
  invitee: { email: string; name: string };
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
};

export type CheckoutSessionResponse = {
  url: string;
  paymentId: string;
};

@Injectable()
export class BillingCheckoutClient {
  private readonly logger = new Logger(BillingCheckoutClient.name);

  constructor(private readonly config: ConfigService) {}

  async createCheckoutSession(
    input: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResponse | null> {
    const base = this.config.getOrThrow<string>('BILLING_URL').replace(/\/$/, '');
    const path = '/internal/checkout-sessions';
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
        },
        body,
      });
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `billing checkout failed status=${response.status} body=${text.slice(0, 300)}`,
        );
        return null;
      }
      return (await response.json()) as CheckoutSessionResponse;
    } catch (error) {
      this.logger.warn(
        `billing unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
