import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as bcrypt from 'bcrypt';
import { Clock } from '../common/clock/clock';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService, type AuthSession, syntheticEmailForPhone } from './auth.service';
import { CustomerSecurityService } from '../customer-security/customer-security.service';
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
    private readonly security: CustomerSecurityService,
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
    await this.writeDevOtpLine({ event: 'request', username: phone, code });
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

    const existing = await this.users.findByPhone(phone);
    if (existing && (await this.security.isEnabled(existing.id))) {
      throw new UnauthorizedException(
        'Two-factor authentication is required. Sign in with your password and authenticator code.',
      );
    }

    await this.prisma.otpChallenge.update({
      where: { id: stored.id },
      data: { usedAt: now },
    });

    let user = existing;
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

    const session = await this.auth.login(this.users.toPublic(user), meta);
    await this.writeDevOtpLine({
      event: 'verify',
      username: phone,
      code: otp,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    return session;
  }

  /** Plaintext OTP file for local development. Never written in production. */
  private async writeDevOtpLine(fields: Record<string, string>): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    const path = process.env.DEV_OTP_LOG_PATH?.trim() || '/app/logs/dev-otp.log';
    const line = [
      new Date().toISOString(),
      ...Object.entries(fields).map(([key, value]) => `${key}=${oneLine(value)}`),
    ].join(' ');
    try {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${line}\n`, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Dev OTP log write failed: ${message}`);
    }
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]/g, '');
}
