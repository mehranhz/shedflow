import { Role } from '@shedflow/db';

export type AuthenticatedUser = {
  id: string;
  email: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  orgId?: string;
  role?: Role;
};
