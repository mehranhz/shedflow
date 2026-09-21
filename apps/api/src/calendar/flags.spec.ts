import { FEATURE_FLAGS, isEnabled, isOutlookCalendarEnabled } from '@shedflow/shared';

describe('feature flags (T-017 / T-038 lite)', () => {
  it('reads FLAGS env', () => {
    expect(
      isEnabled(FEATURE_FLAGS.outlookCalendar, null, 'outlook_calendar,sms'),
    ).toBe(true);
    expect(isEnabled(FEATURE_FLAGS.outlookCalendar, null, '')).toBe(false);
  });

  it('reads org.settings.flags', () => {
    expect(
      isEnabled(FEATURE_FLAGS.outlookCalendar, {
        settings: { flags: ['outlook_calendar'] },
      }),
    ).toBe(true);
  });

  it('requires PRO for outlook', () => {
    expect(
      isOutlookCalendarEnabled(
        { platformPlan: 'PRO', settings: { flags: ['outlook_calendar'] } },
        '',
      ),
    ).toBe(true);
    expect(
      isOutlookCalendarEnabled(
        { platformPlan: 'FREE', settings: { flags: ['outlook_calendar'] } },
        '',
      ),
    ).toBe(false);
  });
});
