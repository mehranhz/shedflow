// Hand-written on purpose: the domain entity must not be an alias of a
// persistence-layer type, otherwise swapping the ORM changes the whole app.
export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

// Picked explicitly rather than omitting `passwordHash` so that fields added to
// the entity are not accidentally exposed through the API.
export type PublicUser = Pick<User, 'id' | 'email' | 'createdAt'>;

export type CreateUserData = {
  /** Already normalised by `UsersService`; repositories store it verbatim. */
  email: string;
  passwordHash: string;
};

export type UpdateUserData = Partial<CreateUserData>;
