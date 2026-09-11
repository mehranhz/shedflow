import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from './request-context.interceptor';
import { RequestContextStore } from './request-context.store';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [
    RequestContextStore,
    RolesGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
  exports: [RequestContextStore, RolesGuard],
})
export class RequestContextModule {}
