"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge, Button, Tabs, TabsList, TabsTrigger } from "@shedflow/ui/components";

import { compareRowMeta, planPrices, type CompareGroup } from "./copy";
import { PrimaryCta } from "./cta-buttons";

export function PricingPlans({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("marketing.pricingPage");
  const tFree = useTranslations("marketing.plans.free");
  const tPro = useTranslations("marketing.plans.pro");
  const tCta = useTranslations("marketing.cta");
  const tCompare = useTranslations("marketing.compare");
  const [interval, setInterval] = useState<"month" | "year">("year");

  const proPrice =
    interval === "year" ? planPrices.pro.yearly : planPrices.pro.monthly;
  const proCadence =
    interval === "year" ? t("yearlyPerYear") : t("monthlyPerMonth");

  const freeFeatures = tFree.raw("features") as string[];
  const freeLimits = tFree.raw("limits") as string[];
  const proFeatures = tPro.raw("features") as string[];

  const groups = useMemo(() => {
    const map = new Map<CompareGroup, (typeof compareRowMeta)[number][]>();
    for (const row of compareRowMeta) {
      const list = map.get(row.group);
      if (list) {
        list.push(row);
      } else {
        map.set(row.group, [row]);
      }
    }
    return [...map.entries()];
  }, []);

  return (
    <div>
      <div className="mkt-interval">
        <p className="mkt-interval-note max-w-md">{t("intervalNote")}</p>
        <Tabs
          value={interval}
          onValueChange={(value) => setInterval(value as "month" | "year")}
        >
          <TabsList>
            <TabsTrigger value="month" className="min-h-9 px-4">
              {t("monthly")}
            </TabsTrigger>
            <TabsTrigger value="year" className="min-h-9 px-4">
              {t("yearly")}
              <Badge variant="secondary" className="ms-1.5">
                {t("twoMonthsFree")}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mkt-teaser">
        <article className="mkt-plan-card">
          <p className="mkt-kicker">{tFree("name")}</p>
          <p className="mkt-price">
            {tFree("price")} <span>/{tFree("cadence")}</span>
          </p>
          <p>{tFree("blurb")}</p>
          <ul className="mkt-checks">
            {freeFeatures.map((feature) => (
              <li key={feature}>
                <Check className="size-3.5" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
          <ul className="mkt-muted-list">
            {freeLimits.map((limit) => (
              <li key={limit}>
                <Minus className="size-3.5" aria-hidden />
                {limit}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <PrimaryCta signedIn={signedIn} className="w-full min-h-11" />
          </div>
        </article>

        <article className="mkt-plan-card mkt-plan-card-pro">
          <div className="flex items-center justify-between gap-3">
            <p className="mkt-kicker">{tPro("name")}</p>
            <Badge>{t("whenYouCharge")}</Badge>
          </div>
          <p className="mkt-price">
            ${proPrice} <span>{proCadence}</span>
          </p>
          {interval === "year" ? (
            <p className="mkt-mono text-xs text-muted-foreground">
              {t("yearlyEffective")}
            </p>
          ) : (
            <p className="mkt-mono text-xs text-muted-foreground">
              {t("orYearly")}
            </p>
          )}
          <p>{tPro("blurb")}</p>
          <ul className="mkt-checks">
            {proFeatures.map((feature) => (
              <li key={feature}>
                <Check className="size-3.5" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mkt-plan-fee">{tPro("fee")}</p>
          <div className="mt-5">
            <Button size="lg" className="w-full min-h-11" asChild>
              <Link href={signedIn ? "/dashboard/billing" : "/register"}>
                {signedIn
                  ? tCta("upgradeInBilling")
                  : tCta("startFreeUpgradeLater")}
              </Link>
            </Button>
          </div>
        </article>
      </div>

      <div className="mkt-compare mt-10" role="table" aria-label={t("compareAria")}>
        <div className="mkt-compare-row" role="row">
          <span role="columnheader">{t("capability")}</span>
          <span role="columnheader">{tFree("name")}</span>
          <span role="columnheader">{tPro("name")}</span>
        </div>
        {compareRowMeta.map((row, index) => {
          const showGroup =
            index === 0 || row.group !== compareRowMeta[index - 1]?.group;
          const groupLabel = tCompare(`groups.${row.group}`);
          const label = tCompare(`rows.${row.row}`);
          const freeVal = tCompare(`values.${row.free}`);
          const proVal = tCompare(`values.${row.pro}`);
          return (
            <div key={row.row}>
              {showGroup ? (
                <div className="mkt-compare-row mkt-compare-group" role="row">
                  <span role="cell">{groupLabel}</span>
                  <span role="cell" />
                  <span role="cell" />
                </div>
              ) : null}
              <div className="mkt-compare-row" role="row">
                <span role="cell">{label}</span>
                <span role="cell">{freeVal}</span>
                <span role="cell">{proVal}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mkt-compare-mobile mt-10">
        {groups.map(([group, rows]) => (
          <article key={group} className="mkt-compare-card">
            <h3>{tCompare(`groups.${group}`)}</h3>
            {rows.map((row) => (
              <div key={row.row} className="mkt-compare-pair">
                <strong>{tCompare(`rows.${row.row}`)}</strong>
                <span>
                  <span>
                    {t("freeDot", {
                      value: tCompare(`values.${row.free}`),
                    })}
                  </span>
                  <span>
                    {t("proDot", {
                      value: tCompare(`values.${row.pro}`),
                    })}
                  </span>
                </span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
