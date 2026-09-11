import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOMAIN_EVENT_NAMES } from '@shedflow/shared';
import { PgBossService } from '../queue/pg-boss.service';
import { POISON_EVENT_TYPE } from './outbox.constants';
import { OutboxRelayService } from './outbox-relay.service';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly relay: OutboxRelayService,
    private readonly boss: PgBossService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const polling = 1;
    await this.boss.workRelay(() => this.relay.relay(), polling);

    const types = new Set<string>([...DOMAIN_EVENT_NAMES, POISON_EVENT_TYPE]);
    for (const type of types) {
      await this.boss.workEventQueue(
        type,
        (job) => this.relay.handleEvent(job),
        polling,
      );
    }

    const interval =
      this.config.get<number>('OUTBOX_RELAY_INTERVAL_MS') ?? 1000;
    this.timer = setInterval(() => {
      void this.boss.sendRelayTick().catch((error) => {
        this.logger.error(error);
      });
    }, interval);
    this.logger.log(`outbox.relay every ${interval}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
