import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { RefundsService } from './refunds.service';

class CreateRefundDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('billing/organizations/:orgId/payments/:paymentId/refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateRefundDto,
  ) {
    return this.refunds.create(orgId, paymentId, user, body);
  }
}
