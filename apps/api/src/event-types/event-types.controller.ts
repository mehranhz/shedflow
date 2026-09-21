import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { RequireScopes } from '../developer/scopes.decorator';
import { ScopesGuard } from '../developer/scopes.guard';
import { CreateEventTypeDto, UpdateEventTypeDto } from './dto/event-type.dto';
import { EventTypesService } from './event-types.service';

@Controller('organizations/:orgId/event-types')
@UseGuards(OrgGuard, ScopesGuard)
export class EventTypesController {
  constructor(private readonly eventTypes: EventTypesService) {}

  @Get()
  @RequireScopes('event_types:read')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.list(orgId, ctx);
  }

  @Post()
  @RequireScopes('event_types:write')
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateEventTypeDto,
  ) {
    const { scheduleId, hostUserId, questions, ...rest } = dto;
    return this.eventTypes.create(orgId, ctx, {
      ...rest,
      ...(scheduleId ? { scheduleId } : {}),
      ...(hostUserId ? { hostUserId } : {}),
      ...(questions ? { questions: questions as never } : {}),
    });
  }

  @Get(':id')
  @RequireScopes('event_types:read')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.get(orgId, id, ctx);
  }

  @Patch(':id')
  @RequireScopes('event_types:write')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpdateEventTypeDto,
  ) {
    const { scheduleId, hostUserId, questions, ...rest } = dto;
    return this.eventTypes.update(orgId, id, ctx, {
      ...rest,
      ...(scheduleId ? { scheduleId } : {}),
      ...(hostUserId ? { hostUserId } : {}),
      ...(questions ? { questions: questions as never } : {}),
    });
  }

  @Delete(':id')
  @RequireScopes('event_types:write')
  softDelete(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.softDelete(orgId, id, ctx);
  }
}
