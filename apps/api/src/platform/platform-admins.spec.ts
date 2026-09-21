import { parsePlatformAdmins } from './platform-admins';

describe('parsePlatformAdmins', () => {
  it('returns empty set when unset', () => {
    expect(parsePlatformAdmins(undefined).size).toBe(0);
    expect(parsePlatformAdmins('').size).toBe(0);
    expect(parsePlatformAdmins('  ').size).toBe(0);
  });

  it('normalizes emails', () => {
    expect([...parsePlatformAdmins('Ops@Example.com, other@x.com')].sort()).toEqual(
      ['ops@example.com', 'other@x.com'],
    );
  });
});
