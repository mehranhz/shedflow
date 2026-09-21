import { ConfigService } from '@nestjs/config';
import { DEV_ENCRYPTION_KEY_BASE64, EnvelopeCrypto } from '@shedflow/shared/envelope';

import { CalendarSyncService } from './calendar-sync.service';
import { CalendarTokenService } from './calendar-token.service';
import { FakeCalendarProvider } from './fake-calendar.provider';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('CalendarSyncService (fake provider)', () => {
  it('fullSync maps seeded events into busy blocks and never persists plaintext tokens', async () => {
    const connectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const calendarId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const crypto = new EnvelopeCrypto(DEV_ENCRYPTION_KEY_BASE64);
    const fake = new FakeCalendarProvider();
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const freeStart = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const freeEnd = new Date(freeStart.getTime() + 60 * 60 * 1000);
    fake.seedEvents('primary', [
      {
        id: 'busy-1',
        status: 'confirmed',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
      {
        id: 'free',
        transparency: 'transparent',
        start: { dateTime: freeStart.toISOString() },
        end: { dateTime: freeEnd.toISOString() },
      },
    ]);

    const created: unknown[] = [];
    const updates: unknown[] = [];
    const prisma = {
      calendarConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: connectionId,
          userId,
          provider: 'GOOGLE',
          needsReauth: false,
          syncToken: null,
          channelId: null,
          resourceId: null,
          channelExpiresAt: null,
          accessTokenEnc: crypto.encrypt('access-secret-token'),
          refreshTokenEnc: crypto.encrypt('refresh-secret-token'),
          tokenExpiresAt: new Date(Date.now() + 3600_000),
          calendars: [
            {
              id: calendarId,
              externalId: 'primary',
              conflictCheck: true,
              writeTarget: true,
            },
          ],
        }),
        update: jest.fn().mockImplementation((args) => {
          updates.push(args);
          return {};
        }),
      },
      externalBusyBlock: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return data;
        }),
      },
    };
    const config = {
      get: (key: string) => {
        if (key === 'ENCRYPTION_KEY') return DEV_ENCRYPTION_KEY_BASE64;
        if (key === 'API_URL') return 'http://localhost:3001';
        return undefined;
      },
    };
    const tokens = new CalendarTokenService(
      prisma as never,
      config as unknown as ConfigService,
      fake,
      fake,
    );
    const sync = new CalendarSyncService(
      prisma as never,
      tokens,
      { enqueueJob: jest.fn() } as never,
      config as unknown as ConfigService,
    );

    await sync.fullSync({ connectionId });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      externalEventId: 'busy-1',
      connectedCalendarId: calendarId,
      hostUserId: userId,
    });
    const serialized = JSON.stringify(updates);
    expect(serialized).not.toContain('access-secret-token');
    expect(serialized).not.toContain('refresh-secret-token');
  });
});
