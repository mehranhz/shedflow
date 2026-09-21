"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge, Button } from "@shedflow/ui/components";

import { planPrices } from "./copy";
import { PrimaryCta } from "./cta-buttons";

export function PlanCard({
  variant,
  signedIn,
  yearly = true,
}: {
  variant: "free" | "pro";
  signedIn: boolean;
  yearly?: boolean;
}) {
  const tFree = useTranslations("marketing.plans.free");
  const tPro = useTranslations("marketing.plans.pro");
  const tCta = useTranslations("marketing.cta");
  const tPrice = useTranslations("marketing.pricingPage");

  if (variant === "free") {
    const features = tFree.raw("features") as string[];
    const limits = tFree.raw("limits") as string[];

    return (
      <article className="mkt-plan-card">
        <p className="mkt-kicker">{tFree("name")}</p>
        <p className="mkt-price">
          {tFree("price")} <span>{tFree("cadence")}</span>
        </p>
        <p>{tFree("blurb")}</p>
        <ul className="mkt-checks">
          {features.map((item) => (
            <li key={item}>
              <Check className="size-3.5" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <ul className="mkt-muted-list">
          {limits.map((item) => (
            <li key={item}>
              <Minus className="size-3.5" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <PrimaryCta signedIn={signedIn} className="w-full min-h-11" />
        </div>
      </article>
    );
  }

  const price = yearly
    ? `$${planPrices.pro.yearlyEffectiveMonthly}`
    : `$${planPrices.pro.monthly}`;
  const cadence = yearly ? tPro("cadenceYearly") : tPro("cadenceMonthly");
  const features = tPro.raw("features") as string[];

  return (
    <article className="mkt-plan-card mkt-plan-card-pro">
      <div className="flex items-center justify-between gap-3">
        <p className="mkt-kicker">{tPro("name")}</p>
        <Badge>{tPrice("whenYouCharge")}</Badge>
      </div>
      <p className="mkt-price">
        {price} <span>{cadence}</span>
      </p>
      {yearly ? (
        <p className="mkt-mono text-xs text-muted-foreground">
          {tPro("yearlyNote", { yearly: planPrices.pro.yearly })}
        </p>
      ) : (
        <p className="mkt-mono text-xs text-muted-foreground">
          {tPro("orYearly", { yearly: planPrices.pro.yearly })}
        </p>
      )}
      <p>{tPro("blurb")}</p>
      <ul className="mkt-checks">
        {features.map((item) => (
          <li key={item}>
            <Check className="size-3.5" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <p className="mkt-plan-fee">{tPro("fee")}</p>
      <div className="mt-5">
        <Button size="lg" className="w-full min-h-11" asChild>
          <Link href={signedIn ? "/dashboard/billing" : "/register"}>
            {signedIn ? tCta("upgradeInBilling") : tCta("startFreeUpgradeLater")}
          </Link>
        </Button>
      </div>
    </article>
  );
}
