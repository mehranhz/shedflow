export const DOMAIN_EVENTS = {
  EmailVerificationRequested: 'auth.email_verification_requested',
  EmailVerified: 'auth.email_verified',
  PasswordResetRequested: 'auth.password_reset_requested',
  PasswordReset: 'auth.password_reset',
  InvitationCreated: 'invitation.created',
  OrganizationCreated: 'organization.created',
  CalendarConnectionReady: 'calendar.connection_ready',
  BookingCreated: 'booking.created',
  BookingConfirmed: 'booking.confirmed',
  BookingCancelled: 'booking.cancelled',
  BookingRescheduled: 'booking.rescheduled',
  BookingExpired: 'booking.expired',
  BookingPaymentRequired: 'booking.payment_required',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  PaymentExpired: 'payment.expired',
  PaymentRefunded: 'payment.refunded',
  SubscriptionCreated: 'subscription.created',
  SubscriptionUpdated: 'subscription.updated',
  SubscriptionCanceled: 'subscription.canceled',
  SubscriptionRenewed: 'subscription.renewed',
} as const;

/** Notification log / Resend template ids used by the worker (T-025 / T-026). */
export const EMAIL_TEMPLATES = {
  VerifyEmail: 'verify-email',
  ResetPassword: 'reset-password',
  Invitation: 'invitation',
  BookingConfirmedHost: 'booking-confirmed-host',
  BookingConfirmedInvitee: 'booking-confirmed-invitee',
  BookingPendingHost: 'booking-pending-host',
  BookingCancelledHost: 'booking-cancelled-host',
  BookingCancelledInvitee: 'booking-cancelled-invitee',
  BookingRescheduledHost: 'booking-rescheduled-host',
  BookingRescheduledInvitee: 'booking-rescheduled-invitee',
  Reminder24h: 'reminder-24h',
  Reminder1h: 'reminder-1h',
  Reminder24hHost: 'reminder-24h-host',
  Reminder24hInvitee: 'reminder-24h-invitee',
  Reminder1hHost: 'reminder-1h-host',
  Reminder1hInvitee: 'reminder-1h-invitee',
  PaymentReceipt: 'payment-receipt',
  PaymentFailed: 'payment-failed',
  PaymentFailedHost: 'payment-failed-host',
} as const;

export type EmailTemplateName =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export const DOMAIN_EVENT_NAMES = Object.values(DOMAIN_EVENTS);
