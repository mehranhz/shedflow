import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { readRequestContext } from './request-context.http';
import { RequestContextStore } from './request-context.store';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly store: RequestContextStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<object>();
    const value = readRequestContext(request);
    if (!value) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      this.store.run(value, () => {
        next.handle().subscribe({
          next: (item) => subscriber.next(item),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
