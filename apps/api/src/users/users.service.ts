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

  async create(
    email: string,
    passwordHash: string,
    extras: {
      name?: string | null;
      timezone?: string;
      phone?: string | null;
      phoneVerifiedAt?: Date | null;
    } = {},
  ): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(email),
        passwordHash,
        ...(extras.name !== undefined ? { name: extras.name } : {}),
        ...(extras.timezone !== undefined ? { timezone: extras.timezone } : {}),
        ...(extras.phone !== undefined ? { phone: extras.phone } : {}),
        ...(extras.phoneVerifiedAt !== undefined
          ? { phoneVerifiedAt: extras.phoneVerifiedAt }
          : {}),
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        if (error.fields.includes('phone')) {
          throw new ConflictException('Phone is already registered');
        }
        if (error.fields.includes('email')) {
          throw new ConflictException('Email is already registered');
        }
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(normalizeEmail(email));
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findByPhone(phone.trim());
  }

  markPhoneVerified(userId: string, verifiedAt: Date): Promise<User> {
    return this.users.update(userId, { phoneVerifiedAt: verifiedAt });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }

  setPassword(userId: string, passwordHash: string): Promise<User> {
    return this.users.update(userId, { passwordHash });
  }

  markEmailVerified(userId: string, verifiedAt: Date): Promise<User> {
    return this.users.update(userId, { emailVerifiedAt: verifiedAt });
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone ?? null,
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      createdAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}
