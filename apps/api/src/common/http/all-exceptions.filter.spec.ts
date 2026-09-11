import { ConflictException, HttpStatus, Logger } from '@nestjs/common';
import {
  EntityNotFoundError,
  UniqueConstraintError,
} from '../persistence';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostWith(requestId = 'req-1') {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return {
    response,
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ requestId, header: () => requestId }),
      }),
    },
  };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps UniqueConstraintError on email to 409 EMAIL_TAKEN', () => {
    const { host, response } = hostWith();
    filter.catch(
      new UniqueConstraintError('User', ['email']),
      host as never,
    );

    expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    expect(response.body).toEqual({
      error: {
        code: 'EMAIL_TAKEN',
        message: expect.stringContaining('email'),
        details: { fields: ['email'] },
        requestId: 'req-1',
      },
    });
  });

  it('maps EntityNotFoundError to 404 NOT_FOUND', () => {
    const { host, response } = hostWith();
    filter.catch(new EntityNotFoundError('User', 'abc'), host as never);

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'NOT_FOUND',
    );
  });

  it('hides unexpected error stacks behind INTERNAL', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, response } = hostWith();
    filter.catch(new Error('secret boom'), host as never);

    expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error',
        details: null,
        requestId: 'req-1',
      },
    });
  });

  it('maps ConflictException IDEMPOTENCY_MISMATCH', () => {
    const { host, response } = hostWith();
    filter.catch(
      new ConflictException({
        code: 'IDEMPOTENCY_MISMATCH',
        message: 'Idempotency-Key was reused with a different request body',
      }),
      host as never,
    );

    expect(response.statusCode).toBe(HttpStatus.CONFLICT);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'IDEMPOTENCY_MISMATCH',
    );
  });
});
