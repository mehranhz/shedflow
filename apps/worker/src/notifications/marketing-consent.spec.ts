import { assertMarketingConsent, hasMarketingConsent } from './marketing-consent';

describe('marketing consent (T-077)', () => {
  it('denies when unset', () => {
    expect(hasMarketingConsent(null)).toBe(false);
    expect(hasMarketingConsent({})).toBe(false);
  });

  it('allows explicit consent', () => {
    expect(hasMarketingConsent({ marketingConsent: true })).toBe(true);
    expect(
      hasMarketingConsent({ marketingConsentedAt: '2026-01-01T00:00:00.000Z' }),
    ).toBe(true);
  });

  it('assert throws without consent', () => {
    expect(() => assertMarketingConsent({})).toThrow(/marketing consent/);
  });
});
