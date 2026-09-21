import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingCancelledInviteeSubject = (eventTitle: string) =>
  `Cancelled: ${eventTitle}`;

export default function BookingCancelledInvitee(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} was cancelled`}
      title="Booking cancelled"
      footer="A calendar cancellation (.ics) is attached."
    >
      {paragraph(`Hi ${props.inviteeName}, your booking for ${props.eventTitle} was cancelled.`)}
      {paragraph(`When: ${props.whenLabel}`)}
      {props.reason ? paragraph(`Reason: ${props.reason}`) : null}
    </EmailShell>
  );
}
