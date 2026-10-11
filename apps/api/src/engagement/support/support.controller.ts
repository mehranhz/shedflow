import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Role } from '@shedflow/db';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OrgGuard } from '../../common/tenancy/org.guard';
import { Roles } from '../../common/tenancy/roles.decorator';
import { RolesGuard } from '../../common/tenancy/roles.guard';
import type { AuthenticatedUser } from '../../users/user';
import {
  CurrentPortalCustomer,
  CustomerPortalGuard,
  type PortalCustomerContext,
} from '../portal-context';
import { SupportService } from './support.service';

class OpenThreadDto {
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}

class PostMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

@Controller('customer/support')
@UseGuards(CustomerPortalGuard)
export class SupportCustomerController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentPortalCustomer() ctx: PortalCustomerContext) {
    return this.support.listThreads(ctx);
  }

  @Post()
  open(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Body() dto: OpenThreadDto,
  ) {
    return this.support.openOrGet(ctx, dto);
  }

  @Get(':threadId')
  get(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.support.getThread(ctx, threadId);
  }

  @Post(':threadId/messages')
  post(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.support.postCustomerMessage(ctx, threadId, dto.body);
  }
}

@Controller('organizations/:orgId/support')
@UseGuards(OrgGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
export class SupportStaffController {
  constructor(private readonly support: SupportService) {}

  @Get(':threadId')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.support.getThreadStaff(orgId, threadId);
  }

  @Post(':threadId/messages')
  post(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PostMessageDto,
  ) {
    return this.support.postStaffMessage(orgId, user.id, threadId, dto.body);
  }
}
