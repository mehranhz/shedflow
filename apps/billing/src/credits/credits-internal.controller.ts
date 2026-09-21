import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import { CreditsService } from './credits.service';

class ConsumeCreditsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  bookingId!: string;

  @IsInt()
  @IsPositive()
  cost!: number;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}

class ReleaseCreditsDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  bookingId!: string;
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal/credits')
export class CreditsInternalController {
  constructor(private readonly credits: CreditsService) {}

  @Post('consume')
  consume(@Body() body: ConsumeCreditsDto) {
    return this.credits.consume(body);
  }

  @Post('release')
  release(@Body() body: ReleaseCreditsDto) {
    return this.credits.release(body);
  }
}
