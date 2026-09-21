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
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import {
  CreateScheduleDto,
  ReplaceRulesDto,
  UpdateScheduleDto,
  UpsertOverrideDto,
} from './dto/schedule.dto';
import { SchedulesService } from './schedules.service';

@Controller('organizations/:orgId/schedules')
@UseGuards(OrgGuard)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.schedules.list(orgId, ctx);
  }

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedules.create(orgId, ctx, dto);
  }

  @Get(':id')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.schedules.get(orgId, id, ctx);
  }

  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(orgId, id, ctx, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.schedules.remove(orgId, id, ctx);
  }

  @Put(':id/rules')
  replaceRules(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: ReplaceRulesDto,
  ) {
    return this.schedules.replaceRules(orgId, id, ctx, dto.rules);
  }

  @Put(':id/overrides/:date')
  upsertOverride(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Body() dto: UpsertOverrideDto,
  ) {
    return this.schedules.upsertOverride(orgId, id, ctx, date, dto);
  }

  @Delete(':id/overrides/:date')
  @HttpCode(204)
  deleteOverride(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @CurrentOrgContext() ctx: RequestContextValue,
  ) {
    return this.schedules.deleteOverride(orgId, id, ctx, date);
  }
}
