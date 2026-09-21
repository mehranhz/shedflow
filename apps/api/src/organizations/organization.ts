import { PlatformPlan } from '@shedflow/db';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string | null;
  platformPlan: PlatformPlan;
  platformStripeCustomerId: string | null;
  platformStripeSubscriptionId: string | null;
  settings: Record<string, unknown>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateOrganizationData = {
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  currency: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  settings?: Record<string, unknown>;
};

export type UpdateOrganizationData = Partial<{
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string | null;
  platformPlan: PlatformPlan;
  platformStripeCustomerId: string | null;
  platformStripeSubscriptionId: string | null;
  settings: Record<string, unknown>;
  deletedAt: Date | null;
}>;

export type PublicOrganization = Omit<Organization, 'deletedAt'>;
