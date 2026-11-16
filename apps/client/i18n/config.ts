/**
 * Locale registry — add a language by appending here and adding `messages/{code}.json`.
 */

export const locales = ["en", "fa"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

/** Cookie that stores the user's locale preference (no URL prefix). */
export const localeCookieName = "NEXT_LOCALE";

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  fa: "فارسی",
};

export const rtlLocales: ReadonlySet<AppLocale> = new Set(["fa"]);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}

/** Persist the locale without recreating the account. The portal shell reads this cookie. */
export function writeLocaleCookie(locale: AppLocale): void {
  if (typeof document === "undefined") {
    return;
  }
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${localeCookieName}=${locale};path=/;max-age=${maxAge};samesite=lax`;
}
