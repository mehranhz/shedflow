/**
 * Marketing consent gate (T-077).
 * Call before any marketing (non-transactional) email/SMS/push send.
 */
export type ConsentRecord = {
  marketingConsentedAt?: string | null;
  marketingConsent?: boolean | null;
  privacyAcceptedAt?: string | null;
};

export function hasMarketingConsent(
  source: ConsentRecord | Record<string, unknown> | null | undefined,
): boolean {
  if (!source || typeof source !== 'object') {
    return false;
  }
  const record = source as ConsentRecord;
  if (record.marketingConsent === true) {
    return true;
  }
  if (
    typeof record.marketingConsentedAt === 'string' &&
    record.marketingConsentedAt.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Throws if marketing consent is missing. Transactional mail must NOT use this.
 */
export function assertMarketingConsent(
  source: ConsentRecord | Record<string, unknown> | null | undefined,
  context = 'marketing send',
): void {
  if (!hasMarketingConsent(source)) {
    throw new Error(`Refusing ${context}: marketing consent not granted`);
  }
}
