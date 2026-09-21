import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingCancelledHostSubject = (eventTitle: string) =>
  `Cancelled: ${eventTitle}`;

export default function BookingCancelledHost(props: BookingEmailProps) {
  return (
    <EmailShell preview={`${props.eventTitle} was cancelled`} title="Booking cancelled">
      {paragraph(`A booking for ${props.eventTitle} was cancelled.`)}
      {paragraph(`When: ${props.whenLabel}`)}
      {paragraph(`Invitee: ${props.inviteeName} <${props.inviteeEmail}>`)}
      {props.reason ? paragraph(`Reason: ${props.reason}`) : null}
    </EmailShell>
  );
}
