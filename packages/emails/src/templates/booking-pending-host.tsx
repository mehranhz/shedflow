import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingPendingHostSubject = (eventTitle: string) =>
  `Needs confirmation: ${eventTitle}`;

export default function BookingPendingHost(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} awaits your confirmation`}
      title="Booking needs confirmation"
      ctaLabel={props.manageUrl ? 'Review booking' : undefined}
      ctaHref={props.manageUrl ?? undefined}
    >
      {paragraph(`A new booking for ${props.eventTitle} is waiting for your confirmation.`)}
      {paragraph(`When: ${props.whenLabel}`)}
      {paragraph(`Invitee: ${props.inviteeName} <${props.inviteeEmail}>`)}
    </EmailShell>
  );
}
