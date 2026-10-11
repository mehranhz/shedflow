import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { AuthenticatedUser } from '../users/user';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerPaymentsService } from './customer-payments.service';

class PortalSessionDto {
  @IsUUID()
  organizationId!: string;

  @IsUrl({ require_tld: false })
  returnUrl!: string;
}

class CancelMembershipDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  subscriptionId!: string;

  @IsBoolean()
  cancelAtPeriodEnd!: boolean;
}

class SubscribeDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  priceId!: string;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}

class PurchasePackageDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  priceId!: string;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

class RedeemGiftCardDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(4)
  code!: string;
}

@Controller('customer')
@UseGuards(CustomerJwtGuard)
export class CustomerPaymentsController {
  constructor(private readonly payments: CustomerPaymentsService) {}

  @Get('payments')
  listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.payments.listPayments(user, organizationId);
  }

  @Get('invoices')
  listInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.payments.listInvoices(user, organizationId);
  }

  @Post('billing/portal-session')
  @Idempotent()
  createPortalSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PortalSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payments.createPortalSession(user, body, idempotencyKey);
  }

  @Get('memberships')
  listMemberships(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.payments.listMemberships(user, organizationId);
  }

  @Post('memberships/cancel')
  @Idempotent()
  cancelMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CancelMembershipDto,
  ) {
    return this.payments.cancelMembership(user, body);
  }

  @Post('memberships/subscribe')
  @Idempotent()
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubscribeDto,
  ) {
    return this.payments.subscribe(user, body);
  }

  @Post('packages/purchase')
  @Idempotent()
  purchasePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PurchasePackageDto,
  ) {
    return this.payments.purchasePackage(user, body);
  }

  @Post('gift-cards/redeem')
  @Idempotent()
  redeemGiftCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RedeemGiftCardDto,
  ) {
    return this.payments.redeemGiftCard(user, body);
  }
}
