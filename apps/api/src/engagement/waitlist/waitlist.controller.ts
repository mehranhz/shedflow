import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  CurrentPortalCustomer,
  CustomerPortalGuard,
  type PortalCustomerContext,
} from '../portal-context';
import { WaitlistService } from './waitlist.service';

class JoinWaitlistDto {
  @IsUUID()
  eventTypeId!: string;

  @IsOptional()
  @IsISO8601()
  preferFrom?: string;

  @IsOptional()
  @IsISO8601()
  preferTo?: string;
}

class ClaimWaitlistDto {
  @IsString()
  timezone!: string;
}

@Controller('customer/waitlist')
@UseGuards(CustomerPortalGuard)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get()
  list(@CurrentPortalCustomer() ctx: PortalCustomerContext) {
    return this.waitlist.list(ctx);
  }

  @Post()
  join(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Body() dto: JoinWaitlistDto,
  ) {
    return this.waitlist.join(ctx, dto);
  }

  @Post(':id/claim')
  claim(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClaimWaitlistDto,
  ) {
    return this.waitlist.claim(ctx, id, dto.timezone);
  }

  @Delete(':id')
  @HttpCode(204)
  leave(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.waitlist.leave(ctx, id);
  }
}
