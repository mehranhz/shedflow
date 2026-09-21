import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  defaultLocale,
  isAppLocale,
  type AppLocale,
  localeCookieName,
} from "./config";

function localeFromAcceptLanguage(header: string | null): AppLocale | null {
  if (!header) {
    return null;
  }

  const preferred = header
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter((value): value is string => Boolean(value));

  for (const tag of preferred) {
    if (isAppLocale(tag)) {
      return tag;
    }
    const base = tag.split("-")[0];
    if (isAppLocale(base)) {
      return base;
    }
  }

  return null;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(localeCookieName)?.value;
  const headerStore = await headers();
  const fromHeader = localeFromAcceptLanguage(
    headerStore.get("accept-language"),
  );

  const locale: AppLocale = isAppLocale(fromCookie)
    ? fromCookie
    : (fromHeader ?? defaultLocale);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
