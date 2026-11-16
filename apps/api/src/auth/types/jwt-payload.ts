import { Role } from '@shedflow/db';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';

export type JwtPayload = {
  sub: string;
  email: string;
  phone?: string;
  orgId?: string;
  role?: Role;
  /** Set when a platform admin is shadowing another org (T-038). */
  impersonatingOrgId?: string;
  /** Customer-portal sessions omit org membership claims. */
  actorType?: 'STAFF' | 'CUSTOMER';
  customerOrgId?: string;
  customerId?: string;
  /** Refresh-token id carried so session revoke can spare the current device. */
  sid?: string;
  typ: typeof ACCESS_TOKEN_TYPE;
};
