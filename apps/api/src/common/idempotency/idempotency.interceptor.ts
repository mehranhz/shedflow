import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY_MAX_LENGTH } from '@shedflow/shared';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { Clock } from '../clock/clock';
import { UniqueConstraintError } from '../persistence';
import { buildErrorEnvelope } from '../http/all-exceptions.filter';
import { readRequestId } from '../http/request-id.middleware';
import { readRequestContext } from '../tenancy/request-context.http';
import { AuthenticatedUser } from '../../users/user';
import { IdempotencyKeyRepository } from '../../idempotency-keys/idempotency-key.repository';
import { IdempotencyKey } from '../../idempotency-keys/idempotency-key';
import { canonicalJson } from './canonical-json';
import {
  IDEMPOTENCY_IN_FLIGHT_STATUS,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENT_METADATA,
} from './idempotent.decorator';

/**
 * HTTP-layer idempotency (mvp/03 §7).
 *
 * Persist 2xx/4xx; do not persist 5xx so the client may retry. Booking create
 * (T-014) writes the key in the same transaction as the booking when a 5xx
 * follows a committed row — this interceptor must not delete that key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly keys: IdempotencyKeyRepository,
    private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!enabled) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const header = readIdempotencyKey(request);
    if (!header) {
      throw new BadRequestException({
        fieldErrors: {
          [IDEMPOTENCY_KEY_HEADER]: ['Idempotency-Key is required'],
        },
      });
    }
    if (header.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException({
        fieldErrors: {
          [IDEMPOTENCY_KEY_HEADER]: [
            `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
          ],
        },
      });
    }

    const scope = resolveScope(request, header);
    const requestHash = hashRequest(request.body);
    const requestId = readRequestId(request);

    return from(this.reserve(scope, header, requestHash)).pipe(
      concatMap((reserved) => {
        if (reserved.replay) {
          response.status(reserved.record.responseStatus);
          return of(reserved.record.responseBody);
        }

        return next.handle().pipe(
          concatMap((data) =>
            from(
              this.persistSuccess(
                reserved.record,
                response.statusCode,
                request.method,
                data,
              ),
            ).pipe(concatMap(() => of(data))),
          ),
          catchError((error: unknown) =>
            from(this.persistFailure(reserved.record, error, requestId)).pipe(
              concatMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }

  private async reserve(
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<{ record: IdempotencyKey; replay: boolean }> {
    const now = this.clock.now();
    const existing = await this.keys.findByScopeAndKey(scope, key);
    if (existing) {
      return this.fromExisting(existing, requestHash, now);
    }

    try {
      const record = await this.keys.create({
        scope,
        key,
        requestHash,
        responseStatus: IDEMPOTENCY_IN_FLIGHT_STATUS,
        responseBody: {},
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      });
      return { record, replay: false };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) {
        throw error;
      }
      const raced = await this.keys.findByScopeAndKey(scope, key);
      if (!raced) {
        throw error;
      }
      return this.fromExisting(raced, requestHash, now);
    }
  }

  private async fromExisting(
    existing: IdempotencyKey,
    requestHash: string,
    now: Date,
  ): Promise<{ record: IdempotencyKey; replay: boolean }> {
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await this.keys.delete(existing.id);
      const record = await this.keys.create({
        scope: existing.scope,
        key: existing.key,
        requestHash,
        responseStatus: IDEMPOTENCY_IN_FLIGHT_STATUS,
        responseBody: {},
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      });
      return { record, replay: false };
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_MISMATCH',
        message: 'Idempotency-Key was reused with a different request body',
      });
    }

    if (existing.responseStatus === IDEMPOTENCY_IN_FLIGHT_STATUS) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A request with this Idempotency-Key is already in progress',
      });
    }

    return { record: existing, replay: true };
  }

  private async persistSuccess(
    record: IdempotencyKey,
    statusCode: number,
    method: string,
    body: unknown,
  ): Promise<void> {
    let status = statusCode >= 200 && statusCode < 500 ? statusCode : 200;
    if (status === 200 && method === 'POST') {
      status = 201;
    }
    await this.keys.update(record.id, {
      responseStatus: status,
      responseBody: body ?? {},
    });
  }

  private async persistFailure(
    record: IdempotencyKey,
    error: unknown,
    requestId: string,
  ): Promise<void> {
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof UniqueConstraintError
          ? 409
          : 500;

    if (status >= 500) {
      await this.keys.delete(record.id);
      return;
    }

    const envelope = buildErrorEnvelope(error, requestId);
    await this.keys.update(record.id, {
      responseStatus: envelope.status,
      responseBody: envelope.body,
    });
  }
}

function readIdempotencyKey(request: Request): string | undefined {
  const header = request.header(IDEMPOTENCY_KEY_HEADER);
  if (typeof header !== 'string') {
    return undefined;
  }
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveScope(request: Request, key: string): string {
  const ctx = readRequestContext(request);
  if (ctx?.organizationId) {
    return `org:${ctx.organizationId}`;
  }
  const user = (request as Request & { user?: AuthenticatedUser }).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  const userAgent = request.headers['user-agent'];
  const ua = typeof userAgent === 'string' ? userAgent : '';
  const digest = createHash('sha256')
    .update(`${request.ip ?? ''}\n${ua}\n${key}`)
    .digest('hex');
  return `public:${digest}`;
}

function hashRequest(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body ?? {})).digest('hex');
}
