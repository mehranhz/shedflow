import { Role } from '@shedflow/db';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';

export type JwtPayload = {
  sub: string;
  email: string;
  orgId?: string;
  role?: Role;
  typ: typeof ACCESS_TOKEN_TYPE;
};
