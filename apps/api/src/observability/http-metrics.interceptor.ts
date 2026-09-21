import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = process.hrtime.bigint();
    const route =
      (req.route?.path as string | undefined) ??
      req.baseUrl ??
      req.path ??
      'unknown';

    if (route === '/metrics' || route === 'metrics') {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, started, route),
        error: () => this.record(req, res, started, route),
      }),
    );
  }

  private record(
    req: Request,
    res: Response,
    started: bigint,
    route: string,
  ): void {
    const elapsedNs = Number(process.hrtime.bigint() - started);
    const durationSeconds = elapsedNs / 1e9;
    this.metrics.observeHttp({
      method: req.method,
      route: String(route),
      status: res.statusCode || 500,
      durationSeconds,
    });
  }
}
