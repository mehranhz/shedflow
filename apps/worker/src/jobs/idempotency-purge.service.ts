import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import { IDEMPOTENCY_PURGE_QUEUE } from './jobs.constants';

@Injectable()
export class IdempotencyPurgeService {
  private readonly logger = new Logger(IdempotencyPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boss: PgBossService,
  ) {}

  /** Daily 03:15 UTC — design §6. */
  async registerSchedule(): Promise<void> {
    await this.boss.scheduleCron(
      IDEMPOTENCY_PURGE_QUEUE,
      '15 3 * * *',
      {},
      { tz: 'UTC' },
    );
    this.logger.log(`scheduled ${IDEMPOTENCY_PURGE_QUEUE} daily 03:15 UTC`);
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    if (result.count > 0) {
      this.logger.log(`purged ${result.count} expired idempotency keys`);
    }
    return result.count;
  }
}
