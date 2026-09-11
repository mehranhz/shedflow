const supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

export function isValidTimeZone(tz: string): boolean {
  return supportedTimeZones.has(tz);
}
