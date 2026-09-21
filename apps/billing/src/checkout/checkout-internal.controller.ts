import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsObject, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import {
  CheckoutService,
  CreateCheckoutSessionInput,
} from './checkout.service';

class InviteeDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

class CreateCheckoutSessionDto implements CreateCheckoutSessionInput {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  bookingId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  priceId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => InviteeDto)
  invitee!: InviteeDto;

  @IsString()
  successUrl!: string;

  @IsString()
  cancelUrl!: string;

  @IsString()
  expiresAt!: string;
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal')
export class CheckoutInternalController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('checkout-sessions')
  create(
    @Body() body: CreateCheckoutSessionDto,
  ): Promise<{ url: string; paymentId: string }> {
    return this.checkout.createCheckoutSession(body);
  }
}
