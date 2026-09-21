"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { EmbedBridge } from "@/components/booking/embed-bridge";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SkipLink } from "@/components/skip-link";
import { brandStyle } from "@/lib/booking-brand";
import { bookingDocumentLang } from "@/lib/document-lang";

export function BookingPageShell({
  brandColor,
  locale,
  embed,
  children,
}: {
  brandColor?: string | null;
  locale?: string;
  embed?: boolean;
  children: ReactNode;
}) {
  const documentLang = bookingDocumentLang(locale);
  return (
    <div
      lang={documentLang}
      className={
        embed ? "min-h-svh bg-background p-2" : "min-h-svh bg-[#f4f5f7] px-4 py-8 md:py-16"
      }
      style={brandStyle(brandColor)}
    >
      {embed ? null : <SkipLink href="#booking-main" />}
      <EmbedBridge enabled={Boolean(embed)} />
      <div id="booking-main">{children}</div>
    </div>
  );
}

export function BookingChrome({
  orgName,
  orgSlug,
  hideBadge,
  embed,
  showBack = true,
}: {
  orgName: string;
  orgSlug: string;
  hideBadge?: boolean;
  embed?: boolean;
  showBack?: boolean;
}) {
  const t = useTranslations("booking.chrome");

  if (embed) {
    return null;
  }
  return (
    <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between gap-3">
      {showBack ? (
        <Link
          href={`/${orgSlug}`}
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("backToOrg", { orgName })}
        </Link>
      ) : (
        <span className="text-sm font-medium">{orgName}</span>
      )}
      <div className="flex items-center gap-3">
        <LocaleSwitcher compact />
        {hideBadge ? null : (
          <span className="text-xs text-muted-foreground">{t("poweredBy")}</span>
        )}
      </div>
    </div>
  );
}

export function BookingCardSkeleton({ className = "h-[520px]" }: { className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-4xl animate-pulse rounded-2xl border bg-background ${className}`}
    />
  );
}
