import { BookingStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import { BookingExpireService } from './booking-expire.service';
import { InternalBookingsClient } from './internal-bookings.client';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('BookingExpireService', () => {
  it('schedules expire at holdExpiresAt for PENDING_PAYMENT', async () => {
    const holdExpiresAt = new Date('2030-01-01T12:15:00.000Z');
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b1',
          status: BookingStatus.PENDING_PAYMENT,
          holdExpiresAt,
        }),
      },
    };
    const boss = { enqueueJob: jest.fn().mockResolvedValue('j1') };
    const internal = { expire: jest.fn(), confirm: jest.fn() };
    const service = new BookingExpireService(
      prisma as unknown as PrismaService,
      boss as unknown as PgBossService,
      internal as unknown as InternalBookingsClient,
    );

    const scheduled = await service.scheduleIfNeeded('b1');
    expect(scheduled).toEqual(holdExpiresAt);
    expect(boss.enqueueJob).toHaveBeenCalledWith(
      'booking.expire',
      { bookingId: 'b1' },
      {
        startAfter: holdExpiresAt,
        singletonKey: 'expire:b1',
      },
    );
  });

  it('calls internal expire when still PENDING_PAYMENT', async () => {
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b1',
          status: BookingStatus.PENDING_PAYMENT,
        }),
      },
    };
    const internal = { expire: jest.fn().mockResolvedValue(undefined), confirm: jest.fn() };
    const service = new BookingExpireService(
      prisma as unknown as PrismaService,
      {} as PgBossService,
      internal as unknown as InternalBookingsClient,
    );

    await service.handleExpire({ bookingId: 'b1' });
    expect(internal.expire).toHaveBeenCalledWith('b1');
  });

  it('no-ops expire when booking is already CONFIRMED', async () => {
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b1',
          status: BookingStatus.CONFIRMED,
        }),
      },
    };
    const internal = { expire: jest.fn(), confirm: jest.fn() };
    const service = new BookingExpireService(
      prisma as unknown as PrismaService,
      {} as PgBossService,
      internal as unknown as InternalBookingsClient,
    );

    await service.handleExpire({ bookingId: 'b1' });
    expect(internal.expire).not.toHaveBeenCalled();
  });
});
