import { Controller, Get } from '@nestjs/common';

@Controller('metrics')
export class MetricsController {
  @Get()
  stub(): { status: 'stub' } {
    return { status: 'stub' };
  }
}
