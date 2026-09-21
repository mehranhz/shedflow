import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OrgGuard } from '../common/tenancy/org.guard';
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
@UseGuards(OrgGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.customers.list(orgId, { page, limit });
  }

  @Get(':id')
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
}
