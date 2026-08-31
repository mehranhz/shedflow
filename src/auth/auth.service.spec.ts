import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InMemoryRepository } from '../common/persistence';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { CreateUserData, UpdateUserData, User } from '../users/user';
import { UserRepository } from '../users/user.repository';

// The whole test double, because InMemoryRepository already implements the
// shared contract. Every future module gets a double this cheaply.
class InMemoryUserRepository
  extends InMemoryRepository<User, CreateUserData, UpdateUserData>
  implements UserRepository
{
  constructor() {
    super('User', ['email']);
  }

  protected buildEntity(id: string, data: CreateUserData): User {
    const now = new Date();
    return {
      id,
      email: data.email,
      passwordHash: data.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere((user) => user.email === email);
  }
}

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        { provide: UserRepository, useClass: InMemoryUserRepository },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-token'),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
  });

  it('registers a user and returns an access token', async () => {
    const result = await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user.email).toBe('ada@example.com');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    await expect(
      authService.register({
        email: 'ADA@example.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('translates a unique constraint violation into a ConflictException', async () => {
    await usersService.create('ada@example.com', 'hash');

    await expect(
      usersService.create('ADA@example.com', 'hash'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates credentials', async () => {
    await authService.register({
      email: 'ada@example.com',
      password: 'password123',
    });

    const valid = await authService.validateUser(
      'ada@example.com',
      'password123',
    );
    const invalid = await authService.validateUser(
      'ada@example.com',
      'wrongpass',
    );

    expect(valid?.email).toBe('ada@example.com');
    expect(invalid).toBeNull();
    expect(await usersService.findByEmail('ada@example.com')).not.toBeNull();
  });
});
