import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingRescheduledHostSubject = (eventTitle: string) =>
  `Rescheduled: ${eventTitle}`;

export default function BookingRescheduledHost(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} was rescheduled`}
      title="Booking rescheduled"
      ctaLabel={props.manageUrl ? 'View booking' : undefined}
      ctaHref={props.manageUrl ?? undefined}
    >
      {paragraph(`A booking for ${props.eventTitle} was rescheduled.`)}
      {paragraph(`New time: ${props.whenLabel}`)}
      {paragraph(`Invitee: ${props.inviteeName} <${props.inviteeEmail}>`)}
    </EmailShell>
  );
}
