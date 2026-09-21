export const WEBHOOK_DISPATCH_QUEUE = 'webhook.dispatch';

export type WebhookDispatchJobPayload = {
  deliveryId: string;
};

/** MVP webhook event types from design 09 §4. */
export const WEBHOOK_EVENT_TYPES = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.rescheduled',
  'booking.expired',
  'payment.succeeded',
  'payment.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
] as const;

export function endpointMatchesEvent(
  endpointEvents: string[],
  eventType: string,
): boolean {
  return endpointEvents.includes('*') || endpointEvents.includes(eventType);
}
