/**
 * Whitelist document `lang` for public booking shells.
 * Unknown / unsupported org locales fall back to `en` (mvp/15).
 * Includes `fa` because product UI ships next-intl FA catalogs.
 */
const BOOKING_LANGS = new Set([
  "en",
  "en-US",
  "en-GB",
  "fa",
  "fa-IR",
]);

export function bookingDocumentLang(locale?: string | null): string {
  if (!locale) {
    return "en";
  }
  const trimmed = locale.trim();
  if (!trimmed) {
    return "en";
  }
  if (BOOKING_LANGS.has(trimmed)) {
    return trimmed === "en-US" ? "en" : trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "en-gb") {
    return "en-GB";
  }
  if (lower.startsWith("en")) {
    return "en";
  }
  if (lower.startsWith("fa")) {
    return "fa";
  }
  return "en";
}
