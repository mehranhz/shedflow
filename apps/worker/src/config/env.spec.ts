import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/shedflow',
  };

  it('defaults WORKER_PORT to 3003 and requires DATABASE_URL', () => {
    const env = validateEnv(base);
    expect(env.WORKER_PORT).toBe(3003);
    expect(env.OUTBOX_MAX_ATTEMPTS).toBe(10);
    expect(env.OUTBOX_RELAY_INTERVAL_MS).toBe(1000);
    expect(env.INTERNAL_API_SECRET).toBe('change-me-in-development');
    expect(env.EMAIL_FROM).toBe('SchedFlow <notifications@mail.schedflow.com>');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.API_URL).toBe('http://localhost:3001');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
