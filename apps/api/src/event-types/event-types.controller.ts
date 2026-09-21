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
import { CreateEventTypeDto, UpdateEventTypeDto } from './dto/event-type.dto';
import { EventTypesService } from './event-types.service';

@Controller('organizations/:orgId/event-types')
@UseGuards(OrgGuard)
export class EventTypesController {
  constructor(private readonly eventTypes: EventTypesService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.list(orgId, ctx);
  }

  @Post()
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
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.get(orgId, id, ctx);
  }

  @Patch(':id')
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
  softDelete(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.eventTypes.softDelete(orgId, id, ctx);
  }
}
