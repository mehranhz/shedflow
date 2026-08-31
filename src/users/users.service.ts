import { ConflictException, Injectable } from '@nestjs/common';
import { UniqueConstraintError } from '../common/persistence';
import { PublicUser, User } from './user';
import { UserRepository } from './user.repository';

// Addresses are compared case-insensitively, so they are stored and looked up in
// one canonical form. Kept here rather than in a repository so that every
// implementation behaves the same way.
function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  async create(email: string, passwordHash: string): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(email),
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof UniqueConstraintError &&
        error.fields.includes('email')
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(normalizeEmail(email));
  }

  findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
