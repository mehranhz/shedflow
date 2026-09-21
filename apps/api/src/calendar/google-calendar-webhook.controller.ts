import { Controller, Headers, Logger, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { PrismaService } from '../prisma/prisma.service';

@Controller('webhooks')
export class GoogleCalendarWebhookController {
  private readonly logger = new Logger(GoogleCalendarWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
  ) {}

  @Public()
  @Post('google-calendar')
  async handle(
    @Headers('x-goog-channel-id') channelId: string | undefined,
    @Headers('x-goog-resource-state') resourceState: string | undefined,
  ): Promise<{ ok: true }> {
    if (!channelId) {
      return { ok: true };
    }
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { channelId },
    });
    if (!connection) {
      this.logger.debug('google webhook unknown channel');
      return { ok: true };
    }
    if (resourceState === 'sync' || resourceState === 'exists') {
      await this.transactions.runInTransaction(async () => {
        await this.outbox.emit(
          DOMAIN_EVENTS.CalendarConnectionReady,
          {
            connectionId: connection.id,
            incremental: true,
          },
          connection.organizationId,
        );
      });
    }
    return { ok: true };
  }
}
