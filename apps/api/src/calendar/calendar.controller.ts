import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@shedflow/db';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import { Roles } from '../common/tenancy/roles.decorator';
import { RolesGuard } from '../common/tenancy/roles.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { CalendarService } from './calendar.service';
import { PatchConnectedCalendarDto } from './dto/patch-connected-calendar.dto';

@Controller()
export class CalendarController {
  constructor(private readonly calendars: CalendarService) {}

  @Get('organizations/:orgId/calendar/google/start')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  startGoogle(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Res() res: Response,
  ) {
    const { url } = this.calendars.startGoogleOAuth(orgId, ctx);
    return res.redirect(url);
  }

  @Public()
  @Get('calendar/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const redirect = await this.calendars.handleGoogleCallback(code, state);
    return res.redirect(redirect);
  }

  /** Launch-optional Outlook (T-017). Gated by outlook_calendar flag + PRO. */
  @Get('organizations/:orgId/calendar/microsoft/start')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  async startMicrosoft(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() ctx: RequestContextValue,
    @Res() res: Response,
  ) {
    const { url } = await this.calendars.startMicrosoftOAuth(orgId, ctx);
    return res.redirect(url);
  }

  @Public()
  @Get('calendar/microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const redirect = await this.calendars.handleMicrosoftCallback(code, state);
    return res.redirect(redirect);
  }

  @Get('organizations/:orgId/calendar/connections')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.calendars.listConnections(orgId);
  }

  @Patch(
    'organizations/:orgId/calendar/connections/:connectionId/calendars/:calendarId',
  )
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  patch(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: PatchConnectedCalendarDto,
  ) {
    return this.calendars.patchCalendar(orgId, connectionId, calendarId, dto);
  }

  @Delete('organizations/:orgId/calendar/connections/:connectionId')
  @UseGuards(OrgGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  disconnect(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.calendars.disconnect(orgId, connectionId);
  }
}
