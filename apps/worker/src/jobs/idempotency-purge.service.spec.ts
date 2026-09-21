import { IdempotencyPurgeService } from './idempotency-purge.service';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';

jest.mock('../queue/pg-boss.service', () => ({
  PgBossService: class PgBossService {},
}));

describe('IdempotencyPurgeService', () => {
  it('deletes expired idempotency keys', async () => {
    const prisma = {
      idempotencyKey: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const boss = { scheduleCron: jest.fn() };
    const service = new IdempotencyPurgeService(
      prisma as unknown as PrismaService,
      boss as unknown as PgBossService,
    );

    const now = new Date('2030-01-01T00:00:00.000Z');
    await expect(service.purgeExpired(now)).resolves.toBe(3);
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
  });
});
