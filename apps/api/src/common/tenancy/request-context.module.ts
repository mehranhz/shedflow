import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScopesGuard } from '../../developer/scopes.guard';
import { RequestContextInterceptor } from './request-context.interceptor';
import { RequestContextStore } from './request-context.store';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [
    RequestContextStore,
    RolesGuard,
    ScopesGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
  exports: [RequestContextStore, RolesGuard, ScopesGuard],
})
export class RequestContextModule {}
