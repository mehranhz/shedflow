import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformPlan } from '@shedflow/db';
import { FEATURE_FLAGS } from '@shedflow/shared';
import { CalendarService } from './calendar.service';
import { MicrosoftCalendarProvider } from './microsoft-calendar.provider';

describe('CalendarService Microsoft OAuth (T-017)', () => {
  function build(opts: {
    platformPlan: PlatformPlan;
    flagsEnv?: string;
    settingsFlags?: string[];
  }) {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          platformPlan: opts.platformPlan,
          settings: opts.settingsFlags
            ? { flags: opts.settingsFlags }
            : {},
        }),
      },
    };
    const jwt = {
      sign: jest.fn().mockReturnValue('signed-state'),
    };
    const config = {
      get: (key: string) => {
        if (key === 'ENCRYPTION_KEY') return undefined;
        if (key === 'APP_URL') return 'http://localhost:3000';
        if (key === 'FLAGS') return opts.flagsEnv;
        if (key === 'MICROSOFT_CLIENT_ID') return 'ms-client';
        if (key === 'API_URL') return 'http://localhost:3001';
        return undefined;
      },
    };
    const microsoft = new MicrosoftCalendarProvider(
      config as unknown as ConfigService,
    );
    const google = {
      name: 'GOOGLE' as const,
      getAuthUrl: jest.fn(),
    };
    const service = new CalendarService(
      prisma as never,
      jwt as unknown as JwtService,
      {} as never,
      {} as never,
      config as unknown as ConfigService,
      google as never,
      microsoft,
    );
    return { service, jwt, microsoft };
  }

  it('generates a Microsoft authorize URL when flag + PRO', async () => {
    const { service, jwt } = build({
      platformPlan: PlatformPlan.PRO,
      flagsEnv: FEATURE_FLAGS.outlookCalendar,
    });
    const { url } = await service.startMicrosoftOAuth('org-1', {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    } as never);
    expect(jwt.sign).toHaveBeenCalled();
    expect(url).toContain('login.microsoftonline.com');
    expect(url).toContain('oauth2/v2.0/authorize');
    expect(url).toContain('client_id=ms-client');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('Calendars.ReadWrite');
  });

  it('rejects when outlook_calendar flag is off', async () => {
    const { service } = build({
      platformPlan: PlatformPlan.PRO,
      flagsEnv: '',
    });
    await expect(
      service.startMicrosoftOAuth('org-1', {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'FEATURE_GATED' },
    });
  });

  it('rejects FREE plan even when flag is on', async () => {
    const { service } = build({
      platformPlan: PlatformPlan.FREE,
      flagsEnv: FEATURE_FLAGS.outlookCalendar,
    });
    await expect(
      service.startMicrosoftOAuth('org-1', {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'FEATURE_GATED' },
    });
  });

  it('allows org.settings.flags to enable the flag', async () => {
    const { service } = build({
      platformPlan: PlatformPlan.PRO,
      settingsFlags: [FEATURE_FLAGS.outlookCalendar],
    });
    const { url } = await service.startMicrosoftOAuth('org-1', {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    } as never);
    expect(url).toContain('login.microsoftonline.com');
  });
});
