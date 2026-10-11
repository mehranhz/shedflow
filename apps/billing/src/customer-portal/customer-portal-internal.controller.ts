import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';
import {
  CreateCustomerPortalSessionInput,
  CustomerPortalService,
} from './customer-portal.service';

class InviteeDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

class CreatePortalSessionDto implements CreateCustomerPortalSessionInput {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  customerId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => InviteeDto)
  invitee!: InviteeDto;

  @IsUrl({ require_tld: false })
  returnUrl!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

class ListByCustomersDto {
  @IsUUID('4', { each: true })
  customerIds!: string[];
}

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal/customer')
export class CustomerPortalInternalController {
  constructor(private readonly portal: CustomerPortalService) {}

  @Post('portal-session')
  createPortalSession(
    @Body() body: CreatePortalSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ url: string; mode: 'portal' | 'setup' }> {
    return this.portal.createPortalSession({
      ...body,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey,
    });
  }

  @Post('payments/list')
  listPayments(@Body() body: ListByCustomersDto) {
    return this.portal.listPaymentsForCustomers(body.customerIds ?? []);
  }

  @Post('invoices/list')
  listInvoices(@Body() body: ListByCustomersDto) {
    return this.portal.listInvoicesForCustomers(body.customerIds ?? []);
  }
}
