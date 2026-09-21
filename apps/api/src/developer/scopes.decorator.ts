import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@shedflow/shared';

export const SCOPES_KEY = 'scopes';

/** Require these scopes when the actor is an API key. JWT users skip the check. */
export const RequireScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
