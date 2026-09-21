import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';
import type { BookingEmailProps } from './booking-confirmed-host.js';

export const bookingConfirmedInviteeSubject = (eventTitle: string) =>
  `You're booked: ${eventTitle}`;

export default function BookingConfirmedInvitee(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} is confirmed`}
      title="You're booked"
      ctaLabel={props.manageUrl ? 'Manage booking' : undefined}
      ctaHref={props.manageUrl ?? undefined}
      footer="A calendar invite (.ics) is attached."
    >
      {paragraph(`Hi ${props.inviteeName}, your booking is confirmed.`)}
      {paragraph(`Event: ${props.eventTitle}`)}
      {paragraph(`When: ${props.whenLabel}`)}
      {props.locationLabel ? paragraph(`Where: ${props.locationLabel}`) : null}
      {paragraph(`Host: ${props.hostName}`)}
    </EmailShell>
  );
}
