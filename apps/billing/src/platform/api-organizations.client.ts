import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  internalTimestamp,
  signInternalRequest,
} from '@shedflow/shared';

export type UpdateOrgPlanRequest = {
  platformPlan: 'FREE' | 'PRO';
  platformStripeCustomerId?: string | null;
  platformStripeSubscriptionId?: string | null;
};

@Injectable()
export class ApiOrganizationsClient {
  private readonly logger = new Logger(ApiOrganizationsClient.name);

  constructor(private readonly config: ConfigService) {}

  async updatePlan(
    organizationId: string,
    input: UpdateOrgPlanRequest,
  ): Promise<void> {
    const base = this.config.getOrThrow<string>('API_URL').replace(/\/$/, '');
    const path = `/internal/organizations/${organizationId}/plan`;
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
          `API plan update failed status=${response.status} body=${text.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `API plan update unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
