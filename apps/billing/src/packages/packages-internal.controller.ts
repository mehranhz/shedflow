import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import {
  CreatePackageCheckoutInput,
  PackagesService,
} from './packages.service';

class InviteeDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

class CreatePackageCheckoutDto implements CreatePackageCheckoutInput {
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

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

class ConsumePackageDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(1)
  cost!: number;
}

class ListPackagesDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal')
export class PackagesInternalController {
  constructor(private readonly packages: PackagesService) {}

  @Post('package-checkout-sessions')
  create(@Body() body: CreatePackageCheckoutDto) {
    return this.packages.createCheckoutSession(body);
  }

  @Post('packages/consume')
  consume(@Body() body: ConsumePackageDto) {
    return this.packages.consumePackageCredits(body);
  }

  @Post('packages/list')
  list(@Body() body: ListPackagesDto) {
    return this.packages.listForCustomer(body.organizationId, body.customerId);
  }
}
