export const CONSENT_PURPOSES = {
  /** Current marketing-text consent. Older rows used `marketing_email`. */
  marketingPhone: 'marketing_phone',
  marketingEmail: 'marketing_email',
  marketingOffers: 'marketing_offers',
} as const;

export type ConsentPurpose =
  (typeof CONSENT_PURPOSES)[keyof typeof CONSENT_PURPOSES];

export type ConsentLog = {
  id: string;
  userId: string;
  organizationId: string | null;
  purpose: string;
  granted: boolean;
  consentedAt: Date;
  ip: string | null;
  userAgent: string | null;
  source: string;
  createdAt: Date;
};

export type CreateConsentLogData = {
  userId: string;
  organizationId: string | null;
  purpose: ConsentPurpose;
  granted: boolean;
  consentedAt: Date;
  ip: string | null;
  userAgent: string | null;
  source: string;
};

/** Consent rows are inserted only. This type exists so the repository contract stays explicit. */
export type UpdateConsentLogData = {
  readonly appendOnly?: never;
};
