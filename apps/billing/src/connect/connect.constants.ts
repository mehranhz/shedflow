export const CONNECT_COUNTRIES = [
  'US',
  'CA',
  'GB',
  'AU',
  'IE',
  'DE',
  'FR',
  'NL',
  'ES',
  'IT',
] as const;

export type ConnectCountry = (typeof CONNECT_COUNTRIES)[number];

export function isConnectCountry(value: string): value is ConnectCountry {
  return (CONNECT_COUNTRIES as readonly string[]).includes(value);
}
