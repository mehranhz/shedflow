export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type PublicUser = Omit<User, 'passwordHash'>;
