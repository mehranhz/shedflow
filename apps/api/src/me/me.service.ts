import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { MembershipRepository } from '../memberships/membership.repository';
import { RefreshTokenRepository } from '../refresh-tokens/refresh-token.repository';
import { PublicUser, User } from '../users/user';
import { UserRepository } from '../users/user.repository';
import { UsersService } from '../users/users.service';

export type MeExport = {
  user: PublicUser & {
    name: string | null;
    timezone: string;
    locale: string;
    deletedAt: Date | null;
  };
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    status: MembershipStatus;
    createdAt: Date;
  }>;
};

export function anonymizedUserEmail(userId: string): string {
  return `deleted+${userId}@invalid.invalid`;
}

@Injectable()
export class MeService {
  constructor(
    private readonly users: UsersService,
    private readonly userRepo: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
    private readonly transactions: TransactionManager,
  ) {}

  async export(userId: string): Promise<MeExport> {
    const user = await this.requireUser(userId);
    const memberships = await this.memberships.listByUserId(userId);
    return {
      user: {
        ...this.users.toPublic(user),
        name: user.name,
        timezone: user.timezone,
        locale: user.locale,
        deletedAt: user.deletedAt,
      },
      memberships: memberships.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Soft-delete the account: anonymize PII, disable memberships, revoke refresh tokens.
   */
  async erase(userId: string): Promise<void> {
    await this.requireUser(userId);
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      await this.memberships.disableAllForUser(userId);
      await this.refreshTokens.revokeAllForUser(userId, now);
      await this.userRepo.update(userId, {
        email: anonymizedUserEmail(userId),
        name: 'Deleted',
        passwordHash: '!', // unusable; login requires bcrypt compare
        emailVerifiedAt: null,
        deletedAt: now,
      });
    });
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('Not found');
    }
    return user;
  }
}
