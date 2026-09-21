import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@shedflow/db';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { Roles } from '../common/tenancy/roles.decorator';
import { RolesGuard } from '../common/tenancy/roles.guard';
import { RequireScopes } from './scopes.decorator';
import { ScopesGuard } from './scopes.guard';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@Controller('organizations/:orgId/webhook-endpoints')
@UseGuards(OrgGuard, ScopesGuard, RolesGuard)
@RequireScopes('webhooks:write')
@Roles(Role.OWNER, Role.ADMIN)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.webhooks.list(orgId, ctx);
  }

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.webhooks.create(orgId, ctx, dto);
  }

  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhooks.update(orgId, id, ctx, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    await this.webhooks.remove(orgId, id, ctx);
  }

  @Get(':id/deliveries')
  listDeliveries(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.webhooks.listDeliveries(orgId, id, ctx);
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  redeliver(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.webhooks.redeliver(orgId, id, deliveryId, ctx);
  }
}
