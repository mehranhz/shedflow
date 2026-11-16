import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DOMAIN_EVENTS } from '@shedflow/shared';
import { AuditService } from '../audit/audit.service';
import {
  DEV_ENCRYPTION_KEY_BASE64,
  EnvelopeCrypto,
} from '../common/crypto/envelope';
import { Clock } from '../common/clock/clock';
import { TransactionManager } from '../common/persistence';
import { Outbox } from '../domain-events/outbox';
import { RefreshTokenRepository } from '../refresh-tokens/refresh-token.repository';
import { UsersService } from '../users/users.service';
import { BackupCodeRepository } from './backup-code.repository';
import { TotpCredential } from './totp-credential';
import { TotpCredentialRepository } from './totp-credential.repository';
import {
  generateBackupCodes,
  generateTotpSecret,
  normalizeBackupCode,
  totpAuthUrl,
  verifyTotp,
} from './totp';

const MFA_TTL_MS = 5 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type SecurityContext = {
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
};

export type SecuritySession = {
  id: string;
  device: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
};

type MfaClaims = {
  sub: string;
  exp: number;
  purpose: 'customer_mfa';
};

@Injectable()
export class CustomerSecurityService {
  private readonly crypto: EnvelopeCrypto;
  private readonly jwtSecret: string;

  constructor(
    private readonly totp: TotpCredentialRepository,
    private readonly backups: BackupCodeRepository,
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditService,
    private readonly outbox: Outbox,
    private readonly transactions: TransactionManager,
    private readonly clock: Clock,
    config: ConfigService,
  ) {
    const key =
      config.get<string>('ENCRYPTION_KEY')?.trim() || DEV_ENCRYPTION_KEY_BASE64;
    this.crypto = new EnvelopeCrypto(key);
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  }

  async overview(userId: string): Promise<{
    totpEnabled: boolean;
    backupCodesRemaining: number;
  }> {
    const row = await this.totp.findByUserId(userId);
    const totpEnabled = Boolean(row?.enabledAt && row.secretCiphertext);
    return {
      totpEnabled,
      backupCodesRemaining: totpEnabled ? await this.backups.countUnused(userId) : 0,
    };
  }

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.totp.findByUserId(userId);
    return Boolean(row?.enabledAt && row.secretCiphertext);
  }

  /** Short-lived login challenge. Null when TOTP is off. */
  async beginLogin(userId: string): Promise<string | null> {
    if (!(await this.isEnabled(userId))) {
      return null;
    }
    const claims: MfaClaims = {
      sub: userId,
      exp: this.clock.now().getTime() + MFA_TTL_MS,
      purpose: 'customer_mfa',
    };
    return signMfa(claims, this.jwtSecret);
  }

  async consumeLogin(mfaToken: string, code: string): Promise<string> {
    const userId = this.readMfa(mfaToken);
    await this.acceptCode(userId, code);
    return userId;
  }

  /**
   * Step-up for password and email changes. No-op when TOTP is off.
   * Backup codes are accepted once.
   */
  async assertStepUp(userId: string, code: string | undefined): Promise<void> {
    if (!(await this.isEnabled(userId))) {
      return;
    }
    if (!code?.trim()) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { totpCode: ['Enter your authentication code'] },
      });
    }
    try {
      await this.acceptCode(userId, code);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { totpCode: ['Invalid authentication code'] },
      });
    }
  }

  async enroll(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const existing = await this.totp.findByUserId(userId);
    if (existing?.enabledAt && existing.secretCiphertext) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    const secret = generateTotpSecret();
    const pending = this.crypto.encrypt(secret).toString('base64');
    if (existing) {
      await this.totp.update(existing.id, { pendingSecretCiphertext: pending });
    } else {
      await this.totp.create({
        userId,
        pendingSecretCiphertext: pending,
        secretCiphertext: null,
        enabledAt: null,
        failedAttempts: 0,
        windowStartedAt: null,
      });
    }
    return { secret, otpauthUrl: totpAuthUrl(user.email, secret) };
  }

  async confirmEnroll(
    userId: string,
    code: string,
    context: SecurityContext = {},
  ): Promise<{ backupCodes: string[] }> {
    const row = await this.totp.findByUserId(userId);
    if (!row?.pendingSecretCiphertext) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { code: ['Start enrollment first'] },
      });
    }
    this.assertNotLocked(row);
    const secret = this.decrypt(row.pendingSecretCiphertext);
    if (!verifyTotp(secret, code, this.clock.now().getTime())) {
      await this.recordFailure(row);
      throw new UnauthorizedException('Invalid authentication code');
    }
    const backupCodes = generateBackupCodes();
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      await this.totp.update(row.id, {
        secretCiphertext: row.pendingSecretCiphertext,
        pendingSecretCiphertext: null,
        enabledAt: now,
        failedAttempts: 0,
        windowStartedAt: null,
      });
      await this.backups.replaceForUser(
        userId,
        backupCodes.map((item) => hashBackupCode(item)),
      );
      await this.audit.record({
        actorUserId: userId,
        actorType: 'user',
        action: 'totp.enroll',
        resourceType: 'user_totp',
        resourceId: row.id,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { backupCodes: backupCodes.length },
      });
      await this.outbox.emit(DOMAIN_EVENTS.CustomerTotpEnabled, { userId }, null);
    });
    return { backupCodes };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    context: SecurityContext = {},
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { password: ['Current password is incorrect'] },
      });
    }
    await this.acceptCode(userId, code);
    const row = await this.totp.findByUserId(userId);
    if (!row) {
      throw new NotFoundException();
    }
    await this.transactions.runInTransaction(async () => {
      await this.totp.update(row.id, {
        secretCiphertext: null,
        pendingSecretCiphertext: null,
        enabledAt: null,
        failedAttempts: 0,
        windowStartedAt: null,
      });
      await this.backups.deleteForUser(userId);
      await this.audit.record({
        actorUserId: userId,
        actorType: 'user',
        action: 'totp.disable',
        resourceType: 'user_totp',
        resourceId: row.id,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: {},
      });
      await this.outbox.emit(DOMAIN_EVENTS.CustomerTotpDisabled, { userId }, null);
    });
  }

  async changePassword(
    userId: string,
    input: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions?: boolean;
      totpCode?: string;
    },
    context: SecurityContext = {},
  ): Promise<{ changed: true }> {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException({
        message: 'Validation failed',
        fieldErrors: { currentPassword: ['Current password is incorrect'] },
      });
    }
    await this.assertStepUp(userId, input.totpCode);
    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      await this.users.setPassword(userId, passwordHash);
      if (input.revokeOtherSessions) {
        await this.refreshTokens.revokeAllForUserExcept(
          userId,
          context.sessionId ?? null,
          now,
        );
      }
      await this.audit.record({
        actorUserId: userId,
        actorType: 'user',
        action: 'password.change',
        resourceType: 'user',
        resourceId: userId,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { revokeOtherSessions: Boolean(input.revokeOtherSessions) },
      });
      await this.outbox.emit(DOMAIN_EVENTS.CustomerPasswordChanged, { userId }, null);
    });
    return { changed: true };
  }

  async listSessions(
    userId: string,
    currentSessionId?: string | null,
  ): Promise<{ sessions: SecuritySession[] }> {
    const rows = await this.refreshTokens.listActiveForUser(userId, this.clock.now());
    return {
      sessions: rows.map((row) => ({
        id: row.id,
        device: deviceLabel(row.userAgent),
        userAgent: row.userAgent,
        ip: coarseIp(row.ip),
        lastUsedAt: row.lastUsedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        current: Boolean(currentSessionId) && row.id === currentSessionId,
      })),
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    context: SecurityContext = {},
  ): Promise<void> {
    const token = await this.refreshTokens.findById(sessionId);
    if (!token || token.userId !== userId) {
      throw new NotFoundException();
    }
    if (token.revokedAt) {
      return;
    }
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      await this.refreshTokens.update(sessionId, { revokedAt: now });
      await this.audit.record({
        actorUserId: userId,
        actorType: 'user',
        action: 'session.revoke',
        resourceType: 'refresh_token',
        resourceId: sessionId,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: {},
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerSessionRevoked,
        { userId, sessionId },
        null,
      );
    });
  }

  async revokeAllSessions(
    userId: string,
    keepCurrent: boolean,
    context: SecurityContext = {},
  ): Promise<void> {
    const now = this.clock.now();
    await this.transactions.runInTransaction(async () => {
      await this.refreshTokens.revokeAllForUserExcept(
        userId,
        keepCurrent ? (context.sessionId ?? null) : null,
        now,
      );
      await this.audit.record({
        actorUserId: userId,
        actorType: 'user',
        action: 'session.revoke_all',
        resourceType: 'user',
        resourceId: userId,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { keepCurrent },
      });
      await this.outbox.emit(
        DOMAIN_EVENTS.CustomerSessionRevoked,
        { userId, all: true, keepCurrent },
        null,
      );
    });
  }

  private async acceptCode(userId: string, code: string): Promise<void> {
    const row = await this.totp.findByUserId(userId);
    if (!row?.enabledAt || !row.secretCiphertext) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    this.assertNotLocked(row);
    const trimmed = code.trim();
    const secret = this.decrypt(row.secretCiphertext);
    if (/^\d{6}$/.test(trimmed) && verifyTotp(secret, trimmed, this.clock.now().getTime())) {
      await this.totp.update(row.id, { failedAttempts: 0, windowStartedAt: null });
      return;
    }
    const used = await this.backups.consume(
      userId,
      hashBackupCode(trimmed),
      this.clock.now(),
    );
    if (used) {
      await this.totp.update(row.id, { failedAttempts: 0, windowStartedAt: null });
      return;
    }
    await this.recordFailure(row);
    throw new UnauthorizedException('Invalid authentication code');
  }

  private assertNotLocked(row: TotpCredential): void {
    if (!row.windowStartedAt || row.failedAttempts < MAX_ATTEMPTS) {
      return;
    }
    const age = this.clock.now().getTime() - row.windowStartedAt.getTime();
    if (age > ATTEMPT_WINDOW_MS) {
      return;
    }
    throw new HttpException(
      {
        message: 'Too many authentication attempts',
        code: 'RATE_LIMITED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async recordFailure(row: TotpCredential): Promise<void> {
    const now = this.clock.now();
    const fresh = (await this.totp.findByUserId(row.userId)) ?? row;
    let attempts = 1;
    let windowStartedAt = now;
    if (
      fresh.windowStartedAt &&
      now.getTime() - fresh.windowStartedAt.getTime() <= ATTEMPT_WINDOW_MS
    ) {
      attempts = fresh.failedAttempts + 1;
      windowStartedAt = fresh.windowStartedAt;
    }
    await this.totp.update(fresh.id, { failedAttempts: attempts, windowStartedAt });
  }

  private readMfa(token: string): string {
    const claims = verifyMfaToken(token, this.jwtSecret);
    if (claims.exp <= this.clock.now().getTime()) {
      throw new UnauthorizedException('Authentication token expired');
    }
    return claims.sub;
  }

  private decrypt(ciphertext: string): string {
    return this.crypto.decrypt(Buffer.from(ciphertext, 'base64'));
  }

  private async requireUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

function signMfa(claims: MfaClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyMfaToken(token: string, secret: string): MfaClaims {
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    throw new UnauthorizedException('Invalid authentication token');
  }
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new UnauthorizedException('Invalid authentication token');
  }
  let claims: MfaClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MfaClaims;
  } catch {
    throw new UnauthorizedException('Invalid authentication token');
  }
  if (claims.purpose !== 'customer_mfa' || typeof claims.sub !== 'string') {
    throw new UnauthorizedException('Invalid authentication token');
  }
  return claims;
}

export function coarseIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return coarseIp(trimmed.slice('::ffff:'.length));
  }
  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) {
    return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    parts[parts.length - 1] = '0';
    return parts.join(':');
  }
  return trimmed;
}

export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}
