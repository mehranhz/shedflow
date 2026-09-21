import { BookingStatus } from '@shedflow/db';
import { LoggingMailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import { ReminderService } from './reminder.service';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('ReminderService', () => {
  it('no-ops when booking is cancelled', async () => {
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b1',
          status: BookingStatus.CANCELLED,
          startAt: new Date('2030-01-01T12:00:00.000Z'),
        }),
      },
      notificationLog: { findFirst: jest.fn(), create: jest.fn() },
    };
    const mailer = new LoggingMailer();
    const boss = { enqueueJob: jest.fn() };
    const service = new ReminderService(
      prisma as unknown as PrismaService,
      boss as unknown as PgBossService,
      mailer,
    );

    await service.handleSend({
      bookingId: 'b1',
      template: 'reminder-1h',
      startAt: '2030-01-01T12:00:00.000Z',
    });

    expect(mailer.sent).toHaveLength(0);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('schedules only 1h reminder when startAt is in 2h', async () => {
    const now = new Date('2030-06-01T12:00:00.000Z');
    const startAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const boss = { enqueueJob: jest.fn().mockResolvedValue('job-1') };
    const service = new ReminderService(
      {} as PrismaService,
      boss as unknown as PgBossService,
      new LoggingMailer(),
    );

    const templates = await service.scheduleForBooking({
      bookingId: 'b1',
      startAt,
      now,
    });

    expect(templates).toEqual(['reminder-1h']);
    expect(boss.enqueueJob).toHaveBeenCalledTimes(1);
    expect(boss.enqueueJob).toHaveBeenCalledWith(
      'reminder.send',
      expect.objectContaining({ template: 'reminder-1h', bookingId: 'b1' }),
      expect.objectContaining({
        singletonKey: 'reminder:b1:reminder-1h',
        startAfter: expect.any(Date),
      }),
    );
  });
});
