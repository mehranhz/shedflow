import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  NotificationChannel,
  NotificationStatus,
} from '@shedflow/db';
import { EMAIL_TEMPLATES } from '@shedflow/shared';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { PgBossService } from '../queue/pg-boss.service';
import {
  planReminders,
  REMINDER_SEND_QUEUE,
  reminderSingletonKey,
  type ReminderJobPayload,
  type ReminderTemplate,
} from './jobs.constants';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly boss: PgBossService,
    private readonly mailer: Mailer,
  ) {}

  async scheduleForBooking(input: {
    bookingId: string;
    startAt: Date;
    now?: Date;
  }): Promise<ReminderTemplate[]> {
    const now = input.now ?? new Date();
    const planned = planReminders({
      bookingId: input.bookingId,
      startAt: input.startAt,
      now,
    });
    for (const item of planned) {
      await this.boss.enqueueJob(REMINDER_SEND_QUEUE, item.payload, {
        startAfter: item.startAfter,
        singletonKey: reminderSingletonKey(input.bookingId, item.template),
      });
    }
    return planned.map((p) => p.template);
  }

  async handleSend(payload: ReminderJobPayload): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: payload.bookingId },
      include: {
        host: true,
        customer: true,
        eventType: true,
      },
    });
    if (!booking) {
      this.logger.debug(`reminder skip missing booking=${payload.bookingId}`);
      return;
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      this.logger.debug(
        `reminder no-op status=${booking.status} booking=${payload.bookingId}`,
      );
      return;
    }
    if (booking.startAt.toISOString() !== payload.startAt) {
      this.logger.debug(
        `reminder no-op startAt changed booking=${payload.bookingId}`,
      );
      return;
    }

    const whenLabel = formatWhen(booking.startAt, booking.endAt, booking.timezone);
    const subject =
      payload.template === 'reminder-24h'
        ? `Reminder: ${booking.eventType.title} in 24 hours`
        : `Reminder: ${booking.eventType.title} in 1 hour`;
    const body = [
      `This is a reminder for ${booking.eventType.title}.`,
      `When: ${whenLabel}`,
      `Host: ${booking.host.name ?? booking.host.email}`,
      `Invitee: ${booking.customer.name} <${booking.customer.email}>`,
    ].join('\n');

    const recipients: Array<{ to: string; template: string; replyTo: string }> = [
      {
        to: booking.host.email,
        template:
          payload.template === 'reminder-24h'
            ? EMAIL_TEMPLATES.Reminder24hHost
            : EMAIL_TEMPLATES.Reminder1hHost,
        replyTo: booking.customer.email,
      },
      {
        to: booking.customer.email,
        template:
          payload.template === 'reminder-24h'
            ? EMAIL_TEMPLATES.Reminder24hInvitee
            : EMAIL_TEMPLATES.Reminder1hInvitee,
        replyTo: booking.host.email,
      },
    ];

    for (const recipient of recipients) {
      const existing = await this.prisma.notificationLog.findFirst({
        where: {
          bookingId: booking.id,
          template: recipient.template,
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.SENT,
        },
      });
      if (existing) {
        continue;
      }
      const result = await this.mailer.send({
        to: recipient.to,
        subject,
        html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
        text: body,
        replyTo: recipient.replyTo,
        idempotencyKey: `${booking.id}:${recipient.template}`,
      });
      await this.prisma.notificationLog.create({
        data: {
          organizationId: booking.organizationId,
          bookingId: booking.id,
          channel: NotificationChannel.EMAIL,
          template: recipient.template,
          toAddress: recipient.to,
          status: NotificationStatus.SENT,
          providerId: result.providerId,
          sentAt: new Date(),
        },
      });
    }
  }
}

function formatWhen(startAt: Date, endAt: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    });
    return `${fmt.format(startAt)} – ${fmt.format(endAt)} (${timezone})`;
  } catch {
    return `${startAt.toISOString()} – ${endAt.toISOString()} (UTC)`;
  }
}
