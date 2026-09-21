"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@shedflow/ui/components";

import { PrimaryCta } from "./cta-buttons";

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("marketing.finalCta");
  const tc = useTranslations("marketing.cta");

  return (
    <section className="mkt-ink mkt-section">
      <div className="mkt-wrap">
        <p className="mkt-kicker">{t("kicker")}</p>
        <h2 className="mkt-h2 mt-3 max-w-xl">{t("title")}</h2>
        <p className="mkt-lead mt-4">{t("lead")}</p>
        <div className="mkt-actions">
          <PrimaryCta signedIn={signedIn} className="mkt-cta-light min-h-11" />
          <Button
            size="lg"
            variant="outline"
            className="mkt-cta-ghost min-h-11"
            asChild
          >
            <Link href="/pricing">{tc("comparePlans")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
