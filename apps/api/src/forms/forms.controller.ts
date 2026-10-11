import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Idempotent } from '../common/idempotency/idempotent.decorator';
import { CurrentOrgContext } from '../common/tenancy/current-org.decorator';
import { OrgGuard } from '../common/tenancy/org.guard';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { RequireScopes } from '../developer/scopes.decorator';
import { ScopesGuard } from '../developer/scopes.guard';
import {
  AttachFormTemplateDto,
  CreateFormTemplateDto,
  UpdateFormTemplateDto,
} from './dto/forms.dto';
import { FormsService } from './forms.service';

@Controller('organizations/:orgId/forms')
@UseGuards(OrgGuard, ScopesGuard)
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @RequireScopes('event_types:read')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentOrgContext() _ctx: RequestContextValue,
  ) {
    return this.forms.listTemplates(orgId);
  }

  @Post()
  @RequireScopes('event_types:write')
  @Idempotent()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateFormTemplateDto,
  ) {
    return this.forms.createTemplate(orgId, dto);
  }

  @Get(':id')
  @RequireScopes('event_types:read')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.forms.getTemplate(orgId, id);
  }

  @Patch(':id')
  @RequireScopes('event_types:write')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormTemplateDto,
  ) {
    return this.forms.updateTemplate(orgId, id, dto);
  }

  @Post('event-types/:eventTypeId/attach')
  @RequireScopes('event_types:write')
  @Idempotent()
  attach(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventTypeId', ParseUUIDPipe) eventTypeId: string,
    @Body() dto: AttachFormTemplateDto,
  ) {
    return this.forms.attachToEventType(
      orgId,
      eventTypeId,
      dto.formTemplateId,
      dto.requiredBeforeConfirm ?? true,
    );
  }
}
