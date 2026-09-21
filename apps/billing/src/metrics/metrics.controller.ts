import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('metrics')
export class MetricsController {
  @Get()
  stub(): { status: 'stub' } {
    return { status: 'stub' };
  }
}
