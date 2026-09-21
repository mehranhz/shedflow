import { Injectable, Logger } from '@nestjs/common';
import { LocationType, Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import type { CalendarEventInput } from './calendar-provider';
import type { CalendarWriteJobPayload } from './calendar.constants';
import { CalendarTokenService } from './calendar-token.service';

type BookingMeta = {
  googleEventId?: string;
  googleCalendarId?: string;
};

@Injectable()
export class CalendarWriteService {
  private readonly logger = new Logger(CalendarWriteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: CalendarTokenService,
  ) {}

  async handle(payload: CalendarWriteJobPayload): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        host: true,
        customer: true,
        eventType: true,
      },
    });
    if (!booking) {
      this.logger.debug(`calendar.write skip missing booking=${payload.bookingId}`);
      return;
    }

    const connection = await this.prisma.calendarConnection.findFirst({
      where: {
        userId: booking.hostUserId,
        needsReauth: false,
        calendars: { some: { writeTarget: true } },
      },
      include: {
        calendars: { where: { writeTarget: true } },
      },
    });
    if (!connection || connection.calendars.length === 0) {
      this.logger.debug(
        `calendar.write skip no write target host=${booking.hostUserId}`,
      );
      return;
    }

    const writeCal = connection.calendars[0]!;
    const provider = this.tokens.providerFor(connection.provider);
    let auth;
    try {
      auth = await this.tokens.ensureFreshTokens(connection);
    } catch {
      return;
    }

    const meta = asMeta(booking.metadata);

    if (payload.action === 'delete') {
      if (!meta.googleEventId) {
        return;
      }
      try {
        await provider.deleteEvent(
          auth,
          meta.googleCalendarId ?? writeCal.externalId,
          meta.googleEventId,
        );
      } catch (error) {
        this.logger.warn(
          `calendar.write delete failed booking=${booking.id} err=${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await this.prisma.externalBusyBlock.deleteMany({
        where: {
          connectedCalendarId: writeCal.id,
          externalEventId: meta.googleEventId,
        },
      });
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          metadata: {
            ...meta,
            googleEventId: undefined,
            googleCalendarId: undefined,
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`calendar.write deleted booking=${booking.id}`);
      return;
    }

    const input = this.buildEventInput(booking);
    if (meta.googleEventId) {
      await provider.updateEvent(
        auth,
        meta.googleCalendarId ?? writeCal.externalId,
        meta.googleEventId,
        input,
      );
      await this.prisma.externalBusyBlock.upsert({
        where: {
          connectedCalendarId_externalEventId: {
            connectedCalendarId: writeCal.id,
            externalEventId: meta.googleEventId,
          },
        },
        create: {
          connectedCalendarId: writeCal.id,
          hostUserId: booking.hostUserId,
          startAt: booking.startAt,
          endAt: booking.endAt,
          externalEventId: meta.googleEventId,
        },
        update: {
          startAt: booking.startAt,
          endAt: booking.endAt,
        },
      });
      this.logger.log(`calendar.write updated booking=${booking.id}`);
      return;
    }

    const created = await provider.createEvent(
      auth,
      writeCal.externalId,
      input,
    );
    const nextMeta: BookingMeta = {
      ...meta,
      googleEventId: created.externalEventId,
      googleCalendarId: writeCal.externalId,
    };
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        metadata: nextMeta as Prisma.InputJsonValue,
        ...(created.meetUrl && booking.locationType === LocationType.GOOGLE_MEET
          ? { locationValue: created.meetUrl }
          : {}),
      },
    });
    await this.prisma.externalBusyBlock.upsert({
      where: {
        connectedCalendarId_externalEventId: {
          connectedCalendarId: writeCal.id,
          externalEventId: created.externalEventId,
        },
      },
      create: {
        connectedCalendarId: writeCal.id,
        hostUserId: booking.hostUserId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        externalEventId: created.externalEventId,
      },
      update: {
        startAt: booking.startAt,
        endAt: booking.endAt,
      },
    });
    this.logger.log(
      `calendar.write created booking=${booking.id} event=${created.externalEventId}`,
    );
  }

  private buildEventInput(booking: {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    locationType: LocationType;
    locationValue: string | null;
    answers: Prisma.JsonValue;
    eventType: { title: string };
    host: { email: string };
    customer: { name: string; email: string };
  }): CalendarEventInput {
    const answers =
      booking.answers && typeof booking.answers === 'object'
        ? JSON.stringify(booking.answers)
        : '';
    const description = [
      `Invitee: ${booking.customer.name} <${booking.customer.email}>`,
      answers ? `Answers: ${answers}` : null,
      booking.locationType === LocationType.PHONE && booking.locationValue
        ? `Phone: ${booking.locationValue}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    let location: string | undefined;
    if (
      booking.locationType === LocationType.LINK ||
      booking.locationType === LocationType.CUSTOM ||
      booking.locationType === LocationType.IN_PERSON
    ) {
      location = booking.locationValue ?? undefined;
    }

    return {
      summary: booking.eventType.title,
      description,
      location,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone: booking.timezone,
      attendeeEmails: [booking.host.email, booking.customer.email],
      createMeet: booking.locationType === LocationType.GOOGLE_MEET,
      bookingId: booking.id,
    };
  }
}

function asMeta(value: Prisma.JsonValue): BookingMeta {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BookingMeta;
  }
  return {};
}
