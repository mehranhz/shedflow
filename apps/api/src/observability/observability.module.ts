import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { buildPinoParams } from './logging.config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import type { ShedflowServiceName } from './metrics.registry';

@Module({
  imports: [
    LoggerModule.forRoot(buildPinoParams('api')),
  ],
  controllers: [MetricsController],
  providers: [
    {
      provide: MetricsService,
      useFactory: () => new MetricsService('api' satisfies ShedflowServiceName),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService, LoggerModule],
})
export class ObservabilityModule {}
