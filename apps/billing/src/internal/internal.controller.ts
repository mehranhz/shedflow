import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { InternalHmacGuard } from '../auth/guards/internal-hmac.guard';

@Public()
@UseGuards(InternalHmacGuard)
@Controller('internal')
export class InternalController {
  @Get('ready')
  ready(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
