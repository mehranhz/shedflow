import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@shedflow/db';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OrgGuard } from '../common/tenancy/org.guard';
import { Roles } from '../common/tenancy/roles.decorator';
import { RolesGuard } from '../common/tenancy/roles.guard';
import { RequireScopes } from '../developer/scopes.decorator';
import { ScopesGuard } from '../developer/scopes.guard';
import { CustomersService } from './customers.service';

class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

@Controller('organizations/:orgId/customers')
@UseGuards(OrgGuard, ScopesGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequireScopes('customers:read')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.customers.list(orgId, { page, limit });
  }

  @Get(':id/export')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  export(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.export(orgId, id);
  }

  @Get(':id')
  @RequireScopes('customers:read')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.get(orgId, id);
  }

  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  async erase(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.customers.erase(orgId, id);
  }
}
