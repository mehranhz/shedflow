import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import {
  CreateMembershipCheckoutInput,
  MembershipsService,
} from './memberships.service';

class InviteeDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

class CreateMembershipCheckoutDto implements CreateMembershipCheckoutInput {
  @IsUUID()
  organizationId!: string;

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
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal')
export class MembershipsInternalController {
  constructor(private readonly memberships: MembershipsService) {}

  @Post('membership-checkout-sessions')
  create(@Body() body: CreateMembershipCheckoutDto): Promise<{ url: string }> {
    return this.memberships.createCheckoutSession(body);
  }

  @Post('memberships/list')
  list(
    @Body() body: { organizationId: string; customerId: string },
  ) {
    return this.memberships.listForCustomer(
      body.organizationId,
      body.customerId,
    );
  }

  @Post('memberships/cancel-at-period-end')
  cancelAtPeriodEnd(
    @Body()
    body: {
      organizationId: string;
      customerId: string;
      subscriptionId: string;
      cancelAtPeriodEnd: boolean;
    },
  ) {
    return this.memberships.setCancelAtPeriodEnd(body);
  }
}
