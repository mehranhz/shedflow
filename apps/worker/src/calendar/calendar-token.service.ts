import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEV_ENCRYPTION_KEY_BASE64, EnvelopeCrypto } from '@shedflow/shared/envelope';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider as CalendarProviderEnum } from '@shedflow/db';

import { PrismaService } from '../prisma/prisma.service';
import {
  CALENDAR_PROVIDER,
  CalendarProvider,
  CalendarTokens,
  MICROSOFT_CALENDAR_PROVIDER,
} from './calendar-provider';

@Injectable()
export class CalendarTokenService {
  private readonly logger = new Logger(CalendarTokenService.name);
  private readonly crypto: EnvelopeCrypto;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(CALENDAR_PROVIDER) private readonly google: CalendarProvider,
    @Inject(MICROSOFT_CALENDAR_PROVIDER)
    private readonly microsoft: CalendarProvider,
  ) {
    const key =
      config.get<string>('ENCRYPTION_KEY')?.trim() || DEV_ENCRYPTION_KEY_BASE64;
    this.crypto = new EnvelopeCrypto(key);
  }

  providerFor(
    provider: CalendarProviderEnum | 'GOOGLE' | 'MICROSOFT',
  ): CalendarProvider {
    if (provider === CalendarProviderEnum.MICROSOFT) {
      return this.microsoft;
    }
    return this.google;
  }

  private enc(plaintext: string): Uint8Array<ArrayBuffer> {
    const encrypted = this.crypto.encrypt(plaintext);
    const bytes = new Uint8Array(encrypted.byteLength);
    bytes.set(encrypted);
    return bytes;
  }

  decryptTokens(connection: {
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): CalendarTokens {
    return {
      accessToken: this.crypto.decrypt(connection.accessTokenEnc),
      refreshToken: this.crypto.decrypt(connection.refreshTokenEnc),
      expiresAt: connection.tokenExpiresAt,
    };
  }

  async ensureFreshTokens(connection: {
    id: string;
    provider: CalendarProviderEnum;
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): Promise<CalendarTokens> {
    const tokens = this.decryptTokens(connection);
    if (tokens.expiresAt.getTime() > Date.now() + 60_000) {
      return tokens;
    }
    const provider = this.providerFor(connection.provider);
    try {
      const refreshed = await provider.refresh(tokens);
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: this.enc(refreshed.accessToken),
          refreshTokenEnc: this.enc(refreshed.refreshToken),
          tokenExpiresAt: refreshed.expiresAt,
          needsReauth: false,
        },
      });
      return refreshed;
    } catch (error) {
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { needsReauth: true },
      });
      this.logger.warn(
        `calendar refresh failed connection=${connection.id} err=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  readSyncTokenMap(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      return { primary: raw };
    }
    return {};
  }

  writeSyncTokenMap(map: Record<string, string>): string {
    return JSON.stringify(map);
  }
}
