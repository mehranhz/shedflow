import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OrgGuard } from '../common/tenancy/org.guard';
import { FlagsService } from './flags.service';

@Controller('organizations/:orgId/feature-flags')
@UseGuards(OrgGuard)
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  async list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const flags = await this.flags.evaluateForOrg(orgId);
    return { flags };
  }
}
