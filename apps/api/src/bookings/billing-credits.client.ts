import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';

export type ConsumeCreditsRequest = {
  organizationId: string;
  customerId: string;
  bookingId: string;
  cost: number;
  subscriptionId?: string;
};

export type ReleaseCreditsRequest = {
  organizationId: string;
  customerId: string;
  bookingId: string;
};

@Injectable()
export class BillingCreditsClient {
  private readonly logger = new Logger(BillingCreditsClient.name);

  constructor(private readonly config: ConfigService) {}

  async consume(
    input: ConsumeCreditsRequest,
  ): Promise<'ok' | 'insufficient' | 'error'> {
    const result = await this.post('/internal/credits/consume', input);
    if (result.status === 422) {
      return 'insufficient';
    }
    if (!result.ok) {
      return 'error';
    }
    return 'ok';
  }

  async release(input: ReleaseCreditsRequest): Promise<void> {
    await this.post('/internal/credits/release', input);
  }

  private async post(
    path: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number }> {
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
        },
        body,
      });
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `billing ${path} status=${response.status} body=${text.slice(0, 200)}`,
        );
      }
      return { ok: response.ok, status: response.status };
    } catch (error) {
      this.logger.warn(
        `billing unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, status: 0 };
    }
  }
}
