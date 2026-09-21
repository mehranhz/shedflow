import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';

export type BookingEmailProps = {
  eventTitle: string;
  whenLabel: string;
  locationLabel?: string | null;
  inviteeName: string;
  inviteeEmail: string;
  hostName: string;
  manageUrl?: string | null;
  reason?: string | null;
};

export const bookingConfirmedHostSubject = (eventTitle: string) =>
  `Confirmed: ${eventTitle}`;

export default function BookingConfirmedHost(props: BookingEmailProps) {
  return (
    <EmailShell
      preview={`${props.eventTitle} is confirmed`}
      title="Booking confirmed"
      ctaLabel={props.manageUrl ? 'View booking' : undefined}
      ctaHref={props.manageUrl ?? undefined}
    >
      {paragraph(`You have a confirmed booking for ${props.eventTitle}.`)}
      {paragraph(`When: ${props.whenLabel}`)}
      {props.locationLabel ? paragraph(`Where: ${props.locationLabel}`) : null}
      {paragraph(`Invitee: ${props.inviteeName} <${props.inviteeEmail}>`)}
    </EmailShell>
  );
}
