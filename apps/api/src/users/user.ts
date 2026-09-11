import { Role } from '@shedflow/db';

// Hand-written on purpose: the domain entity must not be an alias of a
// persistence-layer type, otherwise swapping the ORM changes the whole app.
export type User = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  timezone: string;
  locale: string;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Picked explicitly rather than omitting `passwordHash` so that fields added to
// the entity are not accidentally exposed through the API.
export type PublicUser = Pick<
  User,
  'id' | 'email' | 'createdAt' | 'emailVerifiedAt'
>;

export type AuthenticatedUser = PublicUser & {
  orgId?: string;
  role?: Role;
};

export type CreateUserData = {
  /** Already normalised by `UsersService`; repositories store it verbatim. */
  email: string;
  passwordHash: string;
  name?: string | null;
  timezone?: string;
};

export type UpdateUserData = Partial<{
  email: string;
  passwordHash: string;
  name: string | null;
  timezone: string;
  locale: string;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
}>;
