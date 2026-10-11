import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../users/user';
import {
  CUSTOMER_ORG_HEADER,
  CustomerPortalGuard,
  OptionalCustomerOrg,
} from '../portal-context';
import { DependentsService } from './dependents.service';

class CreateDependentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  guardianAttested?: boolean;
}

@Controller('customer/dependents')
@UseGuards(CustomerPortalGuard)
@OptionalCustomerOrg()
export class DependentsController {
  constructor(private readonly dependents: DependentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.dependents.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDependentDto,
    @Headers(CUSTOMER_ORG_HEADER) orgId?: string,
  ) {
    return this.dependents.create(user.id, dto, orgId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dependents.softDelete(user.id, id);
  }
}
