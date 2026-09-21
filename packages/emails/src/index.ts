import { render } from '@react-email/render';
import * as React from 'react';
import BookingCancelledHost, {
  bookingCancelledHostSubject,
} from './templates/booking-cancelled-host.js';
import BookingCancelledInvitee, {
  bookingCancelledInviteeSubject,
} from './templates/booking-cancelled-invitee.js';
import BookingConfirmedHost, {
  bookingConfirmedHostSubject,
  type BookingEmailProps,
} from './templates/booking-confirmed-host.js';
import BookingConfirmedInvitee, {
  bookingConfirmedInviteeSubject,
} from './templates/booking-confirmed-invitee.js';
import BookingPendingHost, {
  bookingPendingHostSubject,
} from './templates/booking-pending-host.js';
import BookingRescheduledHost, {
  bookingRescheduledHostSubject,
} from './templates/booking-rescheduled-host.js';
import BookingRescheduledInvitee, {
  bookingRescheduledInviteeSubject,
} from './templates/booking-rescheduled-invitee.js';
import Invitation, {
  invitationSubject,
  type InvitationProps,
} from './templates/invitation.js';
import ResetPassword, {
  resetPasswordSubject,
  type ResetPasswordProps,
} from './templates/reset-password.js';
import VerifyEmail, {
  verifyEmailSubject,
  type VerifyEmailProps,
} from './templates/verify-email.js';

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

async function toRendered(
  subject: string,
  element: React.ReactElement,
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject, html, text };
}

export function renderVerifyEmail(props: VerifyEmailProps): Promise<RenderedEmail> {
  return toRendered(verifyEmailSubject, React.createElement(VerifyEmail, props));
}

export function renderResetPassword(
  props: ResetPasswordProps,
): Promise<RenderedEmail> {
  return toRendered(resetPasswordSubject, React.createElement(ResetPassword, props));
}

export function renderInvitation(props: InvitationProps): Promise<RenderedEmail> {
  return toRendered(
    invitationSubject(props.organizationName),
    React.createElement(Invitation, props),
  );
}

export function renderBookingConfirmedHost(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingConfirmedHostSubject(props.eventTitle),
    React.createElement(BookingConfirmedHost, props),
  );
}

export function renderBookingConfirmedInvitee(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingConfirmedInviteeSubject(props.eventTitle),
    React.createElement(BookingConfirmedInvitee, props),
  );
}

export function renderBookingPendingHost(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingPendingHostSubject(props.eventTitle),
    React.createElement(BookingPendingHost, props),
  );
}

export function renderBookingCancelledHost(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingCancelledHostSubject(props.eventTitle),
    React.createElement(BookingCancelledHost, props),
  );
}

export function renderBookingCancelledInvitee(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingCancelledInviteeSubject(props.eventTitle),
    React.createElement(BookingCancelledInvitee, props),
  );
}

export function renderBookingRescheduledHost(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingRescheduledHostSubject(props.eventTitle),
    React.createElement(BookingRescheduledHost, props),
  );
}

export function renderBookingRescheduledInvitee(
  props: BookingEmailProps,
): Promise<RenderedEmail> {
  return toRendered(
    bookingRescheduledInviteeSubject(props.eventTitle),
    React.createElement(BookingRescheduledInvitee, props),
  );
}

export type {
  BookingEmailProps,
  InvitationProps,
  ResetPasswordProps,
  VerifyEmailProps,
};
