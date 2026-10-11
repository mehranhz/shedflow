import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider as CalendarProviderEnum, BookingStatus } from '@shedflow/db';
import {
  DEV_ENCRYPTION_KEY_BASE64,
  EnvelopeCrypto,
} from '@shedflow/shared/envelope';
import {
  CALENDAR_PROVIDER,
  CalendarProvider,
  CalendarTokens,
  MICROSOFT_CALENDAR_PROVIDER,
} from '../calendar/calendar-provider';
import { PrismaService } from '../prisma/prisma.service';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class CustomerCalendarService {
  private readonly logger = new Logger(CustomerCalendarService.name);
  private readonly crypto: EnvelopeCrypto;
  private readonly appUrl: string;
  private readonly apiUrl: string;

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
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    this.apiUrl = (config.get<string>('API_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  private enc(plaintext: string): Uint8Array {
    const encrypted = this.crypto.encrypt(plaintext);
    const bytes = new Uint8Array(encrypted.byteLength);
    bytes.set(encrypted);
    return bytes;
  }

  private providerFor(
    provider: CalendarProviderEnum | 'GOOGLE' | 'MICROSOFT',
  ): CalendarProvider {
    return provider === CalendarProviderEnum.MICROSOFT || provider === 'MICROSOFT'
      ? this.microsoft
      : this.google;
  }

  async listConnections(userId: string) {
    const rows = await this.prisma.customerCalendarConnection.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        accountEmail: true,
        calendarExternalId: true,
        needsReauth: true,
        createdAt: true,
      },
    });
    return rows;
  }

  /** Connect via fake/test code exchange — never logs tokens. */
  async connectWithCode(
    userId: string,
    provider: 'GOOGLE' | 'MICROSOFT',
    code: string,
  ) {
    const cal = this.providerFor(provider);
    const exchanged = await cal.exchangeCode(code);
    const calendars = await cal.listCalendars(exchanged);
    const primary =
      calendars.find((c) => c.primary)?.externalId ?? calendars[0]?.externalId ?? 'primary';

    const row = await this.prisma.customerCalendarConnection.upsert({
      where: {
        userId_provider_accountEmail: {
          userId,
          provider: provider as CalendarProviderEnum,
          accountEmail: exchanged.accountEmail,
        },
      },
      create: {
        userId,
        provider: provider as CalendarProviderEnum,
        accountEmail: exchanged.accountEmail,
        accessTokenEnc: this.enc(exchanged.accessToken),
        refreshTokenEnc: this.enc(exchanged.refreshToken),
        tokenExpiresAt: exchanged.expiresAt,
        scopes: exchanged.scopes,
        calendarExternalId: primary,
      },
      update: {
        accessTokenEnc: this.enc(exchanged.accessToken),
        refreshTokenEnc: this.enc(exchanged.refreshToken),
        tokenExpiresAt: exchanged.expiresAt,
        scopes: exchanged.scopes,
        calendarExternalId: primary,
        needsReauth: false,
      },
      select: {
        id: true,
        provider: true,
        accountEmail: true,
        calendarExternalId: true,
        needsReauth: true,
      },
    });
    this.logger.log(
      `customer calendar connected user=${userId} provider=${provider} connection=${row.id}`,
    );
    return row;
  }

  async disconnect(userId: string, connectionId: string) {
    const row = await this.prisma.customerCalendarConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!row) throw new NotFoundException('Connection not found');
    await this.prisma.customerCalendarEvent.deleteMany({
      where: { connectionId },
    });
    await this.prisma.customerCalendarConnection.delete({
      where: { id: connectionId },
    });
    return { ok: true as const };
  }

  async ensureIcsFeed(userId: string): Promise<{
    token: string;
    feedUrl: string;
    webcalUrl: string;
  }> {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(raw);
    await this.prisma.customerIcsFeed.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.customerIcsFeed.create({
      data: { userId, tokenHash },
    });
    const feedUrl = `${this.apiUrl}/v1/public/customer-calendar/ics/${raw}`;
    const webcalUrl = feedUrl.replace(/^https:/, 'webcal:').replace(/^http:/, 'webcal:');
    return { token: raw, feedUrl, webcalUrl };
  }

  async buildIcsFeed(rawToken: string): Promise<string> {
    const tokenHash = hashToken(rawToken);
    const feed = await this.prisma.customerIcsFeed.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!feed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Invalid feed token' });
    }
    const customers = await this.prisma.customer.findMany({
      where: { userId: feed.userId },
      select: { id: true },
    });
    const customerIds = customers.map((c) => c.id);
    const now = new Date();
    const bookings =
      customerIds.length === 0
        ? []
        : await this.prisma.booking.findMany({
            where: {
              customerId: { in: customerIds },
              status: BookingStatus.CONFIRMED,
              startAt: { gte: now },
            },
            include: {
              eventType: true,
              host: true,
              organization: true,
            },
            orderBy: { startAt: 'asc' },
            take: 200,
          });

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SchedFlow Customer//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    for (const b of bookings) {
      const uid = `${b.uid}@schedflow.com`;
      const stamp = formatUtc(new Date());
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatUtc(b.startAt)}`,
        `DTEND:${formatUtc(b.endAt)}`,
        `SUMMARY:${escapeText(b.eventType.title)}`,
        `DESCRIPTION:${escapeText(`${b.organization.name} · ${b.host.name ?? b.host.email}`)}`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  async writeBookingEvent(
    bookingId: string,
    action: 'upsert' | 'delete',
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        eventType: true,
        host: true,
      },
    });
    if (!booking?.customer.userId) {
      this.logger.debug(`customer calendar skip no user link booking=${bookingId}`);
      return;
    }
    const connections = await this.prisma.customerCalendarConnection.findMany({
      where: { userId: booking.customer.userId, needsReauth: false },
    });
    for (const connection of connections) {
      const provider = this.providerFor(connection.provider);
      const tokens: CalendarTokens = {
        accessToken: this.crypto.decrypt(connection.accessTokenEnc),
        refreshToken: this.crypto.decrypt(connection.refreshTokenEnc),
        expiresAt: connection.tokenExpiresAt,
      };
      const calendarId = connection.calendarExternalId ?? 'primary';
      const existing = await this.prisma.customerCalendarEvent.findUnique({
        where: {
          connectionId_bookingId: {
            connectionId: connection.id,
            bookingId: booking.id,
          },
        },
      });

      try {
        if (action === 'delete') {
          if (!existing) continue;
          await provider.deleteEvent(tokens, calendarId, existing.externalEventId);
          await this.prisma.customerCalendarEvent.delete({
            where: { id: existing.id },
          });
          continue;
        }
        const input = {
          summary: booking.eventType.title,
          description: `With ${booking.host.name ?? booking.host.email}`,
          startAt: booking.startAt,
          endAt: booking.endAt,
          timezone: booking.timezone,
          attendeeEmails: [booking.customer.email],
          bookingId: booking.id,
        };
        if (existing) {
          await provider.updateEvent(
            tokens,
            calendarId,
            existing.externalEventId,
            input,
          );
        } else {
          const created = await provider.createEvent(tokens, calendarId, input);
          await this.prisma.customerCalendarEvent.create({
            data: {
              connectionId: connection.id,
              bookingId: booking.id,
              externalEventId: created.externalEventId,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `customer calendar write failed connection=${connection.id} err=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

function formatUtc(date: Date): string {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return iso.endsWith('Z') ? iso : `${iso}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
