import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Public()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res({ passthrough: false }) res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType());
    res.status(200).send(await this.metrics.scrape());
  }
}
