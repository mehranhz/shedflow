import { anonymizedUserEmail } from './me.service';

describe('anonymizedUserEmail', () => {
  it('uses deleted+{id}@invalid.invalid', () => {
    expect(anonymizedUserEmail('user-1')).toBe(
      'deleted+user-1@invalid.invalid',
    );
  });
});
