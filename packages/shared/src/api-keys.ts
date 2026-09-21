export const API_KEY_SCOPES = [
  'bookings:read',
  'bookings:write',
  'event_types:read',
  'event_types:write',
  'customers:read',
  'webhooks:write',
  'availability:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
