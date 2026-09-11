export const DOMAIN_EVENTS = {
  EmailVerificationRequested: 'auth.email_verification_requested',
  EmailVerified: 'auth.email_verified',
  PasswordResetRequested: 'auth.password_reset_requested',
  PasswordReset: 'auth.password_reset',
  OrganizationCreated: 'organization.created',
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

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export const DOMAIN_EVENT_NAMES = Object.values(DOMAIN_EVENTS);
