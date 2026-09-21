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
import { Role } from '@shedflow/db';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { Roles } from '../common/tenancy/roles.decorator';
import { RolesGuard } from '../common/tenancy/roles.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('organizations/:orgId/api-keys')
@UseGuards(OrgGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.apiKeys.list(orgId, ctx);
  }

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(orgId, ctx, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    await this.apiKeys.revoke(orgId, id, ctx);
  }
}
