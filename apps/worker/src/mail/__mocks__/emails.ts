type Rendered = { subject: string; html: string; text: string };

async function fake(subject: string): Promise<Rendered> {
  return { subject, html: `<p>${subject}</p>`, text: subject };
}

export const renderVerifyEmail = () => fake('Verify your SchedFlow email');
export const renderResetPassword = () => fake('Reset your SchedFlow password');
export const renderInvitation = (props: { organizationName: string }) =>
  fake(`You're invited to ${props.organizationName} on SchedFlow`);
export const renderBookingConfirmedHost = (props: { eventTitle: string }) =>
  fake(`Confirmed: ${props.eventTitle}`);
export const renderBookingConfirmedInvitee = (props: { eventTitle: string }) =>
  fake(`You're booked: ${props.eventTitle}`);
export const renderBookingPendingHost = (props: { eventTitle: string }) =>
  fake(`Needs confirmation: ${props.eventTitle}`);
export const renderBookingCancelledHost = (props: { eventTitle: string }) =>
  fake(`Cancelled: ${props.eventTitle}`);
export const renderBookingCancelledInvitee = (props: { eventTitle: string }) =>
  fake(`Cancelled: ${props.eventTitle}`);
export const renderBookingRescheduledHost = (props: { eventTitle: string }) =>
  fake(`Rescheduled: ${props.eventTitle}`);
export const renderBookingRescheduledInvitee = (props: { eventTitle: string }) =>
  fake(`Rescheduled: ${props.eventTitle}`);
