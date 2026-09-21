import { planReminders, REMINDER_1H_MS, REMINDER_24H_MS } from './jobs.constants';

describe('planReminders', () => {
  const bookingId = 'bk-1';
  const now = new Date('2030-06-01T12:00:00.000Z');

  it('schedules 24h and 1h when startAt is far enough', () => {
    const startAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const planned = planReminders({ bookingId, startAt, now });
    expect(planned.map((p) => p.template)).toEqual(['reminder-24h', 'reminder-1h']);
    expect(planned[0]!.startAfter.getTime()).toBe(startAt.getTime() - REMINDER_24H_MS);
    expect(planned[1]!.startAfter.getTime()).toBe(startAt.getTime() - REMINDER_1H_MS);
  });

  it('skips 24h when booking starts in 2h (only 1h reminder)', () => {
    const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const planned = planReminders({ bookingId, startAt, now });
    expect(planned.map((p) => p.template)).toEqual(['reminder-1h']);
    expect(planned[0]!.startAfter.getTime()).toBe(startAt.getTime() - REMINDER_1H_MS);
  });

  it('skips both when startAt is within 1h', () => {
    const startAt = new Date(now.getTime() + 30 * 60 * 1000);
    expect(planReminders({ bookingId, startAt, now })).toEqual([]);
  });
});
