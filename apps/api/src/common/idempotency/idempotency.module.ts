import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyKeysModule } from '../../idempotency-keys/idempotency-keys.module';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  imports: [IdempotencyKeysModule],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class IdempotencyModule {}
