import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PublicUser, User } from './user';

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();

  create(email: string, passwordHash: string): Promise<User> {
    const user: User = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    return Promise.resolve(
      [...this.users.values()].find((user) => user.email === normalized),
    );
  }

  findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.users.get(id));
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
