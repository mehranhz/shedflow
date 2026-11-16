"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  isAppLocale,
  localeNames,
  locales,
  writeLocaleCookie,
} from "@/i18n/config";

export function LocaleSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Smaller control for tight headers */
  compact?: boolean;
}) {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = (next: string) => {
    if (!isAppLocale(next) || next === locale) {
      return;
    }
    writeLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <label
      className={
        className ??
        "inline-flex items-center gap-2 text-sm text-muted-foreground"
      }
    >
      <span className={compact ? "sr-only" : undefined}>{t("label")}</span>
      <select
        className="min-h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={locale}
        disabled={pending}
        aria-label={t("label")}
        onChange={(event) => onChange(event.target.value)}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
