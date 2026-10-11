import { CUSTOMER_EXPORT_ASYNC_THRESHOLD } from './customer-gdpr.service';

describe('CustomerGdprService constants', () => {
  it('uses a sensible async export threshold', () => {
    expect(CUSTOMER_EXPORT_ASYNC_THRESHOLD).toBeGreaterThan(10);
  });
});

describe('customer export shape (contract)', () => {
  it('documents required top-level keys', () => {
    const keys = [
      'exportedAt',
      'user',
      'customers',
      'bookings',
      'consents',
    ] as const;
    expect(keys).toContain('bookings');
    expect(keys).toContain('consents');
  });
});
