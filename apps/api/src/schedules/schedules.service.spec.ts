import { BadRequestException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

describe('SchedulesService overlapping rules', () => {
  const service = Object.create(SchedulesService.prototype) as SchedulesService;

  it('rejects overlapping windows on the same day', () => {
    expect(() =>
      (
        service as unknown as {
          assertRulesValid: (rules: unknown) => void;
        }
      ).assertRulesValid([
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 700, endMinute: 900 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('allows adjacent windows on the same day', () => {
    expect(() =>
      (
        service as unknown as {
          assertRulesValid: (rules: unknown) => void;
        }
      ).assertRulesValid([
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 720, endMinute: 900 },
      ]),
    ).not.toThrow();
  });
});
