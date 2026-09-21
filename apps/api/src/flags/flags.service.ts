import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_FLAG_VALUES,
  FEATURE_FLAGS,
  isEnabled,
  isOutlookCalendarEnabled,
  type FeatureFlag,
} from '@shedflow/shared';
import { OrganizationRepository } from '../organizations/organization.repository';

@Injectable()
export class FlagsService {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly config: ConfigService,
  ) {}

  /** Env FLAGS + org.settings.flags for a known organization. */
  async evaluateForOrg(organizationId: string): Promise<Record<FeatureFlag, boolean>> {
    const org = await this.organizations.findActiveById(organizationId);
    const envFlags = this.config.get<string>('FLAGS');
    const result = {} as Record<FeatureFlag, boolean>;
    for (const flag of FEATURE_FLAG_VALUES) {
      result[flag] = isEnabled(flag, org, envFlags);
    }
    return result;
  }

  async isEnabled(flag: FeatureFlag | string, organizationId: string): Promise<boolean> {
    const org = await this.organizations.findActiveById(organizationId);
    return isEnabled(flag, org, this.config.get<string>('FLAGS'));
  }

  async isOutlookCalendarEnabled(organizationId: string): Promise<boolean> {
    const org = await this.organizations.findActiveById(organizationId);
    return isOutlookCalendarEnabled(org, this.config.get<string>('FLAGS'));
  }

  /** Sync helper for callers that already loaded the org (e.g. T-017). */
  isEnabledForOrg(
    flag: FeatureFlag | string,
    org: { settings?: unknown; platformPlan?: string } | null,
  ): boolean {
    return isEnabled(flag, org, this.config.get<string>('FLAGS'));
  }

  isOutlookEnabledForOrg(
    org: { settings?: unknown; platformPlan?: string } | null,
  ): boolean {
    return isOutlookCalendarEnabled(org, this.config.get<string>('FLAGS'));
  }

  knownFlags(): FeatureFlag[] {
    return [...FEATURE_FLAG_VALUES];
  }

  /** Re-export constants for DI consumers. */
  readonly keys = FEATURE_FLAGS;
}
