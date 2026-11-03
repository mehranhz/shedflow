"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@shedflow/ui/components";

import { PORTAL_DUAL_RESOLVED_COOKIE } from "@/lib/portal/constants";

function markDualResolved(): void {
  document.cookie = `${PORTAL_DUAL_RESOLVED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function PortalChoosePanel() {
  const t = useTranslations("portal.choose");

  return (
    <div className="flex flex-col gap-3">
      <Button asChild className="min-h-11">
        <Link href="/portal" onClick={markDualResolved}>
          {t("portal")}
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-11">
        <Link href="/dashboard" onClick={markDualResolved}>
          {t("dashboard")}
        </Link>
      </Button>
    </div>
  );
}
