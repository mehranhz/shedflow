import { Role } from '@shedflow/db';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';

export type JwtPayload = {
  sub: string;
  email: string;
  orgId?: string;
  role?: Role;
  /** Set when a platform admin is shadowing another org (T-038). */
  impersonatingOrgId?: string;
  typ: typeof ACCESS_TOKEN_TYPE;
};
