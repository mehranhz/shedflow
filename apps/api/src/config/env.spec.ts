import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = {
    JWT_SECRET: 'secret',
    DATABASE_URL: 'postgresql://localhost/shedflow',
  };

  it('defaults APP_URL and PORT', () => {
    const env = validateEnv(base);
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.PORT).toBe(3001);
  });

  it('rejects a missing JWT_SECRET', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: base.DATABASE_URL }),
    ).toThrow(/JWT_SECRET/);
  });
});
