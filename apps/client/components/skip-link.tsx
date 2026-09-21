"use client";

import { useTranslations } from "next-intl";

/** Visually hidden until focused — first tab stop for keyboard users. */
export function SkipLink({ href = "#main" }: { href?: string }) {
  const t = useTranslations("common");
  return (
    <a
      href={href}
      className="sf-skip focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sr-only"
    >
      {t("skipToContent")}
    </a>
  );
}
