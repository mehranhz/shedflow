import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, MinLength } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import { GiftCardsService } from './gift-cards.service';

class RedeemGiftCardDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(4)
  code!: string;
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal/gift-cards')
export class GiftCardsInternalController {
  constructor(private readonly giftCards: GiftCardsService) {}

  /** Redeem is idempotent-rejected on double use; callers should throttle (T-065). */
  @Post('redeem')
  redeem(@Body() body: RedeemGiftCardDto) {
    return this.giftCards.redeem(body);
  }
}
