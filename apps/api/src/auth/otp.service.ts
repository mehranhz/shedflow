import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Clock } from '../common/clock/clock';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService, type AuthSession, syntheticEmailForPhone } from './auth.service';
import type { RefreshTokenClientMeta } from '../refresh-tokens/refresh-token';

const OTP_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly clock: Clock,
  ) {}

  async request(username: string): Promise<{ success: true }> {
    const phone = username.trim();
    if (!phone) {
      throw new BadRequestException('Phone number is required');
    }
    const since = new Date(this.clock.now().getTime() - OTP_TTL_MS);
    const existing = await this.prisma.otpChallenge.findFirst({
      where: {
        username: phone,
        usedAt: null,
        createdAt: { gte: since },
      },
    });
    if (existing) {
      throw new BadRequestException('A verification code was already sent');
    }

    const code = String(randomInt(100000, 1000000));
    await this.prisma.otpChallenge.create({
      data: {
        username: phone,
        codeHash: hashCode(code),
        expiresAt: new Date(this.clock.now().getTime() + OTP_TTL_MS),
      },
    });
    this.logger.log(`OTP for ${phone}: ${code}`);
    return { success: true };
  }

  async verify(
    username: string,
    code: string,
    meta: RefreshTokenClientMeta = {},
  ): Promise<AuthSession> {
    const phone = username.trim();
    const otp = code.trim();
    if (!phone || !otp) {
      throw new BadRequestException('Phone and code are required');
    }

    const stored = await this.prisma.otpChallenge.findFirst({
      where: { username: phone, codeHash: hashCode(otp), usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const now = this.clock.now();
    if (!stored || stored.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.prisma.otpChallenge.update({
      where: { id: stored.id },
      data: { usedAt: now },
    });

    let user = await this.users.findByPhone(phone);
    if (!user) {
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      user = await this.users.create(syntheticEmailForPhone(phone), passwordHash, {
        phone,
        phoneVerifiedAt: now,
      });
      await this.users.markEmailVerified(user.id, now);
      user = (await this.users.findById(user.id)) ?? user;
    } else if (!user.phoneVerifiedAt) {
      user = await this.users.markPhoneVerified(user.id, now);
    }

    return this.auth.login(this.users.toPublic(user), meta);
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
