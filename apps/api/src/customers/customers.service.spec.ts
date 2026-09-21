import { anonymizedCustomerEmail } from './customers.service';

describe('anonymizedCustomerEmail', () => {
  it('uses deleted+{id}@invalid.invalid', () => {
    expect(anonymizedCustomerEmail('abc-123')).toBe(
      'deleted+abc-123@invalid.invalid',
    );
  });
});
