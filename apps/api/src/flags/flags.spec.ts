import { FEATURE_FLAGS, isEnabled, isOutlookCalendarEnabled } from '@shedflow/shared';

describe('feature flags (shared)', () => {
  it('enables from env FLAGS', () => {
    expect(
      isEnabled(FEATURE_FLAGS.outlookCalendar, { settings: {} }, 'outlook_calendar,sms'),
    ).toBe(true);
    expect(isEnabled(FEATURE_FLAGS.sms, null, '')).toBe(false);
  });

  it('enables from org.settings.flags', () => {
    expect(
      isEnabled(FEATURE_FLAGS.embedV2, {
        settings: { flags: ['embed_v2'] },
      }),
    ).toBe(true);
  });

  it('requires Pro for Outlook', () => {
    expect(
      isOutlookCalendarEnabled(
        { platformPlan: 'FREE', settings: { flags: ['outlook_calendar'] } },
        '',
      ),
    ).toBe(false);
    expect(
      isOutlookCalendarEnabled(
        { platformPlan: 'PRO', settings: { flags: ['outlook_calendar'] } },
        '',
      ),
    ).toBe(true);
    expect(
      isOutlookCalendarEnabled(
        { platformPlan: 'PRO', settings: {} },
        'outlook_calendar',
      ),
    ).toBe(true);
  });
});
