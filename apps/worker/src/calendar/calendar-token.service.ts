import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEV_ENCRYPTION_KEY_BASE64,
  EnvelopeCrypto,
} from '@shedflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  CALENDAR_PROVIDER,
  CalendarProvider,
  CalendarTokens,
} from './calendar-provider';

@Injectable()
export class CalendarTokenService {
  private readonly logger = new Logger(CalendarTokenService.name);
  private readonly crypto: EnvelopeCrypto;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(CALENDAR_PROVIDER) private readonly provider: CalendarProvider,
  ) {
    const key =
      config.get<string>('ENCRYPTION_KEY')?.trim() || DEV_ENCRYPTION_KEY_BASE64;
    this.crypto = new EnvelopeCrypto(key);
  }

  decryptTokens(connection: {
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): CalendarTokens {
    return {
      accessToken: this.crypto.decrypt(Buffer.from(connection.accessTokenEnc)),
      refreshToken: this.crypto.decrypt(Buffer.from(connection.refreshTokenEnc)),
      expiresAt: connection.tokenExpiresAt,
    };
  }

  async ensureFreshTokens(connection: {
    id: string;
    accessTokenEnc: Buffer | Uint8Array;
    refreshTokenEnc: Buffer | Uint8Array;
    tokenExpiresAt: Date;
  }): Promise<CalendarTokens> {
    const tokens = this.decryptTokens(connection);
    if (tokens.expiresAt.getTime() > Date.now() + 60_000) {
      return tokens;
    }
    try {
      const refreshed = await this.provider.refresh(tokens);
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: this.crypto.encrypt(refreshed.accessToken),
          refreshTokenEnc: this.crypto.encrypt(refreshed.refreshToken),
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
      // legacy single token — treat as primary
      return { primary: raw };
    }
    return {};
  }

  writeSyncTokenMap(map: Record<string, string>): string {
    return JSON.stringify(map);
  }
}
