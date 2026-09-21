import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ScopesGuard } from './scopes.guard';
import { SCOPES_KEY } from './scopes.decorator';

describe('ScopesGuard', () => {
  function make(
    user: { actorType?: string; scopes?: string[] } | undefined,
    required: string[] | undefined,
  ) {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === SCOPES_KEY ? required : undefined,
    } as unknown as Reflector;
    const guard = new ScopesGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    };
    return guard.canActivate(context as never);
  }

  it('allows JWT users without scopes', () => {
    expect(make({ actorType: 'user' }, ['bookings:read'])).toBe(true);
    expect(make({}, undefined)).toBe(true);
  });

  it('rejects API keys missing a required scope', () => {
    expect(() =>
      make({ actorType: 'api_key', scopes: ['customers:read'] }, [
        'bookings:read',
      ]),
    ).toThrow(ForbiddenException);
  });

  it('allows API keys with the required scope', () => {
    expect(
      make({ actorType: 'api_key', scopes: ['bookings:read'] }, [
        'bookings:read',
      ]),
    ).toBe(true);
  });

  it('rejects API keys on unscoped routes', () => {
    expect(() =>
      make({ actorType: 'api_key', scopes: ['bookings:read'] }, undefined),
    ).toThrow(ForbiddenException);
  });
});
