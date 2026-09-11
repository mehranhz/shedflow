import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { InMemoryRepository, UniqueConstraintError } from '../persistence';
import { Clock } from '../clock/clock';
import {
  CreateIdempotencyKeyData,
  IdempotencyKey,
  UpdateIdempotencyKeyData,
} from '../../idempotency-keys/idempotency-key';
import { IdempotencyKeyRepository } from '../../idempotency-keys/idempotency-key.repository';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IDEMPOTENCY_IN_FLIGHT_STATUS } from './idempotent.decorator';

class InMemoryIdempotencyKeyRepository
  extends InMemoryRepository<
    IdempotencyKey,
    CreateIdempotencyKeyData,
    UpdateIdempotencyKeyData
  >
  implements IdempotencyKeyRepository
{
  constructor() {
    super('IdempotencyKey');
  }

  protected buildEntity(
    id: string,
    data: CreateIdempotencyKeyData,
  ): IdempotencyKey {
    return {
      id,
      scope: data.scope,
      key: data.key,
      requestHash: data.requestHash,
      responseStatus: data.responseStatus,
      responseBody: data.responseBody,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
    };
  }

  override create(data: CreateIdempotencyKeyData): Promise<IdempotencyKey> {
    const clash = [...this.rows.values()].find(
      (row) => row.scope === data.scope && row.key === data.key,
    );
    if (clash) {
      return Promise.reject(
        new UniqueConstraintError('IdempotencyKey', ['scope', 'key']),
      );
    }
    return super.create(data);
  }

  findByScopeAndKey(
    scope: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return this.findOneWhere((row) => row.scope === scope && row.key === key);
  }
}

class FrozenClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }

  now(): Date {
    return new Date(this.instant);
  }
}

function contextFor(request: object, response: { statusCode: number; status: (code: number) => unknown }): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  let keys: InMemoryIdempotencyKeyRepository;
  let interceptor: IdempotencyInterceptor;
  const reflector = { getAllAndOverride: () => true };

  beforeEach(() => {
    keys = new InMemoryIdempotencyKeyRepository();
    interceptor = new IdempotencyInterceptor(
      reflector as never,
      keys,
      new FrozenClock(now),
    );
  });

  it('requires Idempotency-Key', () => {
    const response = { statusCode: 201, status: jest.fn() };
    const ctx = contextFor(
      {
        method: 'POST',
        body: { name: 'Acme' },
        header: () => undefined,
        headers: {},
        user: { id: 'user-1' },
      },
      response,
    );

    expect(() => interceptor.intercept(ctx, { handle: () => of({}) })).toThrow(
      BadRequestException,
    );
  });

  it('replays a stored 2xx when the key and body match', async () => {
    const response = {
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const request = {
      method: 'POST',
      body: { name: 'Acme' },
      header: (name: string) =>
        name.toLowerCase() === 'idempotency-key' ? 'key-1' : undefined,
      headers: {},
      user: { id: 'user-1' },
      requestId: 'req-1',
    };
    const first = await lastValueFrom(
      interceptor.intercept(contextFor(request, response), {
        handle: () => of({ id: 'org-1', name: 'Acme' }),
      }),
    );
    expect(first).toEqual({ id: 'org-1', name: 'Acme' });

    const stored = [...keys['rows'].values()][0];
    expect(stored?.responseStatus).toBe(201);
    expect(stored?.responseStatus).not.toBe(IDEMPOTENCY_IN_FLIGHT_STATUS);

    const replayed = await lastValueFrom(
      interceptor.intercept(contextFor(request, response), {
        handle: () => of({ id: 'org-2', name: 'Should not run' }),
      }),
    );
    expect(replayed).toEqual({ id: 'org-1', name: 'Acme' });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('throws IDEMPOTENCY_MISMATCH when the same key is reused with a different body', async () => {
    const response = { statusCode: 201, status: jest.fn().mockReturnThis() };
    const header = (name: string) =>
      name.toLowerCase() === 'idempotency-key' ? 'key-1' : undefined;
    await lastValueFrom(
      interceptor.intercept(
        contextFor(
          {
            method: 'POST',
            body: { name: 'Acme' },
            header,
            headers: {},
            user: { id: 'user-1' },
            requestId: 'req-1',
          },
          response,
        ),
        { handle: () => of({ id: 'org-1' }) },
      ),
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(
            {
              method: 'POST',
              body: { name: 'Beta' },
              header,
              headers: {},
              user: { id: 'user-1' },
              requestId: 'req-2',
            },
            response,
          ),
          { handle: () => of({ id: 'org-2' }) },
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
