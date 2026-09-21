"use client";

import { useTranslations } from "next-intl";

/** Visually hidden until focused — first tab stop for keyboard users. */
export function SkipLink({ href = "#main" }: { href?: string }) {
  const t = useTranslations("common");
  return (
    <a href={href} className="sf-skip">
      {t("skipToContent")}
    </a>
  );
}
