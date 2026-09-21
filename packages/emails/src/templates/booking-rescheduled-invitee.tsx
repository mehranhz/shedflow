import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingRescheduledInviteeSubject = (eventTitle: string) =>
  `Rescheduled: ${eventTitle}`;

export default function BookingRescheduledInvitee(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} was rescheduled`}
      title="Booking rescheduled"
      ctaLabel={props.manageUrl ? 'Manage booking' : undefined}
      ctaHref={props.manageUrl ?? undefined}
      footer="An updated calendar invite (.ics) is attached."
    >
      {paragraph(`Hi ${props.inviteeName}, your booking for ${props.eventTitle} was rescheduled.`)}
      {paragraph(`New time: ${props.whenLabel}`)}
      {paragraph(`Host: ${props.hostName}`)}
    </EmailShell>
  );
}
