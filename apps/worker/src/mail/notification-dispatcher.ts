import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@shedflow/db';
import { DOMAIN_EVENTS, EMAIL_TEMPLATES, type EmailTemplateName } from '@shedflow/shared';
import {
  renderBookingCancelledHost,
  renderBookingCancelledInvitee,
  renderBookingConfirmedHost,
  renderBookingConfirmedInvitee,
  renderBookingPendingHost,
  renderBookingRescheduledHost,
  renderBookingRescheduledInvitee,
  renderInvitation,
  renderResetPassword,
  renderVerifyEmail,
  type BookingEmailProps,
  type RenderedEmail,
} from '@shedflow/emails';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventJob } from '../queue/pg-boss.service';
import { buildIcs } from './ics';
import { MailAttachment, Mailer } from './mailer';
import { PermanentMailError } from './resend-mailer';

type BookingContext = {
  id: string;
  uid: string;
  organizationId: string;
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  locationType: string;
  locationValue: string | null;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  eventTitle: string;
  hostEmail: string;
  hostName: string | null;
  inviteeEmail: string;
  inviteeName: string;
};

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
  }

  async handle(job: DomainEventJob): Promise<void> {
    switch (job.type) {
      case DOMAIN_EVENTS.EmailVerificationRequested:
        await this.handleVerifyEmail(job);
        return;
      case DOMAIN_EVENTS.PasswordResetRequested:
        await this.handleResetPassword(job);
        return;
      case DOMAIN_EVENTS.InvitationCreated:
        await this.handleInvitation(job);
        return;
      case DOMAIN_EVENTS.BookingCreated:
        await this.handleBookingCreated(job);
        return;
      case DOMAIN_EVENTS.BookingConfirmed:
        await this.handleBookingConfirmed(job);
        return;
      case DOMAIN_EVENTS.BookingCancelled:
        await this.handleBookingCancelled(job);
        return;
      case DOMAIN_EVENTS.BookingRescheduled:
        await this.handleBookingRescheduled(job);
        return;
      case DOMAIN_EVENTS.PaymentSucceeded:
        await this.handlePaymentSucceeded(job);
        return;
      case DOMAIN_EVENTS.PaymentFailed:
        await this.handlePaymentFailed(job);
        return;
      default:
        return;
    }
  }

  private async handleVerifyEmail(job: DomainEventJob): Promise<void> {
    const userId = asString(job.payload.userId);
    const token = asString(job.payload.token);
    if (!userId || !token) {
      this.logger.warn(`verify-email missing payload id=${job.eventId}`);
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return;
    }
    const rendered = await renderVerifyEmail({
      name: user.name,
      verifyUrl: `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
    });
    await this.deliver({
      organizationId: job.organizationId,
      bookingId: null,
      template: EMAIL_TEMPLATES.VerifyEmail,
      to: user.email,
      rendered,
      idempotencyKey: `${job.eventId}:${EMAIL_TEMPLATES.VerifyEmail}`,
    });
  }

  private async handleResetPassword(job: DomainEventJob): Promise<void> {
    const userId = asString(job.payload.userId);
    const token = asString(job.payload.token);
    if (!userId || !token) {
      this.logger.warn(`reset-password missing payload id=${job.eventId}`);
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return;
    }
    const rendered = await renderResetPassword({
      name: user.name,
      resetUrl: `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
    });
    await this.deliver({
      organizationId: job.organizationId,
      bookingId: null,
      template: EMAIL_TEMPLATES.ResetPassword,
      to: user.email,
      rendered,
      idempotencyKey: `${job.eventId}:${EMAIL_TEMPLATES.ResetPassword}`,
    });
  }

  private async handleInvitation(job: DomainEventJob): Promise<void> {
    const invitationId = asString(job.payload.invitationId);
    const token = asString(job.payload.token);
    const email = asString(job.payload.email)?.toLowerCase();
    if (!invitationId || !token || !email) {
      this.logger.warn(`invitation missing payload id=${job.eventId}`);
      return;
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { organization: true },
    });
    if (!invitation) {
      return;
    }
    const rendered = await renderInvitation({
      organizationName: invitation.organization.name,
      role: invitation.role,
      inviteUrl: `${this.appUrl}/invite/${encodeURIComponent(token)}`,
    });
    await this.deliver({
      organizationId: invitation.organizationId,
      bookingId: null,
      template: EMAIL_TEMPLATES.Invitation,
      to: email,
      rendered,
      idempotencyKey: `${job.eventId}:${EMAIL_TEMPLATES.Invitation}`,
    });
  }

  private async handleBookingCreated(job: DomainEventJob): Promise<void> {
    const bookingId = asString(job.payload.bookingId);
    if (!bookingId) {
      return;
    }
    const booking = await this.loadBooking(bookingId);
    if (!booking || booking.status !== BookingStatus.PENDING_CONFIRMATION) {
      return;
    }
    const props = this.bookingProps(booking, job.payload);
    const rendered = await renderBookingPendingHost(props);
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingPendingHost,
      to: booking.hostEmail,
      replyTo: booking.inviteeEmail,
      rendered,
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingPendingHost}`,
    });
  }

  private async handleBookingConfirmed(job: DomainEventJob): Promise<void> {
    const bookingId = asString(job.payload.bookingId);
    if (!bookingId) {
      return;
    }
    const booking = await this.loadBooking(bookingId);
    if (!booking) {
      return;
    }
    const props = this.bookingProps(booking, job.payload);
    const ics = this.icsAttachment(booking, 'REQUEST', booking.rescheduledFromId ? 1 : 0);

    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingConfirmedHost,
      to: booking.hostEmail,
      replyTo: booking.inviteeEmail,
      rendered: await renderBookingConfirmedHost(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingConfirmedHost}`,
      attachments: [ics],
    });
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingConfirmedInvitee,
      to: booking.inviteeEmail,
      replyTo: booking.hostEmail,
      rendered: await renderBookingConfirmedInvitee(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingConfirmedInvitee}`,
      attachments: [ics],
    });
  }

  private async handleBookingCancelled(job: DomainEventJob): Promise<void> {
    const bookingId = asString(job.payload.bookingId);
    if (!bookingId) {
      return;
    }
    const booking = await this.loadBooking(bookingId);
    if (!booking) {
      return;
    }
    const props = this.bookingProps(booking, job.payload);
    const ics = this.icsAttachment(booking, 'CANCEL', 1);

    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingCancelledHost,
      to: booking.hostEmail,
      replyTo: booking.inviteeEmail,
      rendered: await renderBookingCancelledHost(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingCancelledHost}`,
      attachments: [ics],
    });
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingCancelledInvitee,
      to: booking.inviteeEmail,
      replyTo: booking.hostEmail,
      rendered: await renderBookingCancelledInvitee(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingCancelledInvitee}`,
      attachments: [ics],
    });
  }

  private async handleBookingRescheduled(job: DomainEventJob): Promise<void> {
    const toId = asString(job.payload.toId);
    if (!toId) {
      return;
    }
    const booking = await this.loadBooking(toId);
    if (!booking) {
      return;
    }
    const props = this.bookingProps(booking, job.payload);
    const ics = this.icsAttachment(booking, 'REQUEST', 1);

    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingRescheduledHost,
      to: booking.hostEmail,
      replyTo: booking.inviteeEmail,
      rendered: await renderBookingRescheduledHost(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingRescheduledHost}`,
      attachments: [ics],
    });
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.BookingRescheduledInvitee,
      to: booking.inviteeEmail,
      replyTo: booking.hostEmail,
      rendered: await renderBookingRescheduledInvitee(props),
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.BookingRescheduledInvitee}`,
      attachments: [ics],
    });
  }

  private async handlePaymentSucceeded(job: DomainEventJob): Promise<void> {
    const bookingId = asString(job.payload.bookingId);
    if (!bookingId) {
      return;
    }
    const booking = await this.loadBooking(bookingId);
    if (!booking) {
      return;
    }
    const amountLabel = asString(job.payload.amountLabel) ?? 'your payment';
    const subject = `Receipt: ${booking.eventTitle}`;
    const text = `Thanks ${booking.inviteeName}. We received ${amountLabel} for ${booking.eventTitle}.`;
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.PaymentReceipt,
      to: booking.inviteeEmail,
      replyTo: booking.hostEmail,
      rendered: { subject, html: `<p>${text}</p>`, text },
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.PaymentReceipt}`,
    });
  }

  private async handlePaymentFailed(job: DomainEventJob): Promise<void> {
    const bookingId = asString(job.payload.bookingId);
    if (!bookingId) {
      return;
    }
    const booking = await this.loadBooking(bookingId);
    if (!booking) {
      return;
    }
    const reason = asString(job.payload.reason) ?? 'Payment failed';
    const inviteeText = `Hi ${booking.inviteeName}, ${reason} for ${booking.eventTitle}. Please try again.`;
    const hostText = `Payment failed for ${booking.eventTitle} (${booking.inviteeEmail}): ${reason}`;
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.PaymentFailed,
      to: booking.inviteeEmail,
      replyTo: booking.hostEmail,
      rendered: {
        subject: `Payment failed: ${booking.eventTitle}`,
        html: `<p>${inviteeText}</p>`,
        text: inviteeText,
      },
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.PaymentFailed}`,
    });
    await this.deliver({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      template: EMAIL_TEMPLATES.PaymentFailedHost,
      to: booking.hostEmail,
      replyTo: booking.inviteeEmail,
      rendered: {
        subject: `Payment failed: ${booking.eventTitle}`,
        html: `<p>${hostText}</p>`,
        text: hostText,
      },
      idempotencyKey: `${booking.id}:${EMAIL_TEMPLATES.PaymentFailedHost}`,
    });
  }

  private bookingProps(
    booking: BookingContext,
    payload: Record<string, unknown>,
  ): BookingEmailProps {
    const tokens = asRecord(payload.actionTokens);
    const manageToken = asString(tokens?.manage);
    return {
      eventTitle: booking.eventTitle,
      whenLabel: formatWhen(booking.startAt, booking.endAt, booking.timezone),
      locationLabel: booking.locationValue,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      hostName: booking.hostName?.trim() || booking.hostEmail,
      manageUrl: manageToken
        ? `${this.appUrl}/b/${booking.uid}/manage?token=${encodeURIComponent(manageToken)}`
        : `${this.appUrl}/b/${booking.uid}/manage`,
      reason: booking.cancellationReason,
    };
  }

  private icsAttachment(
    booking: BookingContext,
    method: 'REQUEST' | 'CANCEL',
    sequence: number,
  ): MailAttachment {
    const content = Buffer.from(
      buildIcs({
        uid: booking.uid,
        method,
        sequence,
        summary: booking.eventTitle,
        startAt: booking.startAt,
        endAt: booking.endAt,
        organizerEmail: booking.hostEmail,
        organizerName: booking.hostName,
        attendeeEmail: booking.inviteeEmail,
        attendeeName: booking.inviteeName,
        location: booking.locationValue,
      }),
      'utf8',
    );
    return {
      filename: 'invite.ics',
      content,
      contentType: 'text/calendar; charset=utf-8',
    };
  }

  private async loadBooking(id: string): Promise<BookingContext | null> {
    const row = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        host: true,
        customer: true,
        eventType: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      uid: row.uid,
      organizationId: row.organizationId,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
      locationType: row.locationType,
      locationValue: row.locationValue,
      cancellationReason: row.cancellationReason,
      rescheduledFromId: row.rescheduledFromId,
      eventTitle: row.eventType.title,
      hostEmail: row.host.email,
      hostName: row.host.name,
      inviteeEmail: row.customer.email,
      inviteeName: row.customer.name,
    };
  }

  private async deliver(input: {
    organizationId: string | null;
    bookingId: string | null;
    template: EmailTemplateName;
    to: string;
    replyTo?: string;
    rendered: RenderedEmail;
    idempotencyKey: string;
    attachments?: MailAttachment[];
  }): Promise<void> {
    if (input.bookingId) {
      const existing = await this.prisma.notificationLog.findFirst({
        where: {
          bookingId: input.bookingId,
          template: input.template,
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.SENT,
        },
      });
      if (existing) {
        this.logger.debug(
          `skip duplicate ${input.template} booking=${input.bookingId}`,
        );
        return;
      }
    }

    try {
      const result = await this.mailer.send({
        to: input.to,
        subject: input.rendered.subject,
        html: input.rendered.html,
        text: input.rendered.text,
        replyTo: input.replyTo,
        idempotencyKey: input.idempotencyKey,
        attachments: input.attachments,
      });
      await this.insertLog({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        template: input.template,
        to: input.to,
        status: NotificationStatus.SENT,
        providerId: result.providerId,
        sentAt: new Date(),
      });
    } catch (error) {
      if (error instanceof PermanentMailError) {
        await this.insertLog({
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          template: input.template,
          to: input.to,
          status: NotificationStatus.FAILED,
          error: error.message,
        });
        return;
      }
      throw error;
    }
  }

  private async insertLog(input: {
    organizationId: string | null;
    bookingId: string | null;
    template: string;
    to: string;
    status: NotificationStatus;
    providerId?: string | null;
    error?: string;
    sentAt?: Date;
  }): Promise<void> {
    try {
      await this.prisma.notificationLog.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          channel: NotificationChannel.EMAIL,
          template: input.template,
          toAddress: input.to,
          status: input.status,
          providerId: input.providerId ?? null,
          error: input.error ?? null,
          sentAt: input.sentAt ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `notification_logs unique hit template=${input.template} booking=${input.bookingId}`,
        );
        return;
      }
      // Partial unique may surface as raw driver error
      if (isUniqueViolation(error)) {
        this.logger.debug(
          `notification_logs unique hit template=${input.template} booking=${input.bookingId}`,
        );
        return;
      }
      throw error;
    }
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  return code === '23505' || code === 'P2002';
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
