import { Module } from '@nestjs/common';
import { GiftCardsInternalController } from './gift-cards-internal.controller';
import { GiftCardsService } from './gift-cards.service';

@Module({
  controllers: [GiftCardsInternalController],
  providers: [GiftCardsService],
  exports: [GiftCardsService],
})
export class GiftCardsModule {}
