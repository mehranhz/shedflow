import { Module } from '@nestjs/common';
import { PrismaStripeEventRepository } from './prisma-stripe-event.repository';
import { StripeEventRepository } from './stripe-event.repository';

@Module({
  providers: [
    {
      provide: StripeEventRepository,
      useClass: PrismaStripeEventRepository,
    },
  ],
  exports: [StripeEventRepository],
})
export class StripeEventsModule {}
