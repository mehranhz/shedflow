import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContextValue } from './request-context';

@Injectable()
export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContextValue>();

  run<T>(value: RequestContextValue, fn: () => T): T {
    return this.storage.run(value, fn);
  }

  get(): RequestContextValue | undefined {
    return this.storage.getStore();
  }

  require(): RequestContextValue {
    const value = this.storage.getStore();
    if (!value) {
      throw new Error('RequestContext is not set');
    }
    return value;
  }
}
