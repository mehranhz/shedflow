"use client";

import { useTranslations } from "next-intl";

import { MarketingFaq } from "./faq";
import { FinalCta } from "./final-cta";
import { PricingPlans } from "./pricing-plans";

export function PricingPage({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("marketing.pricingPage");
  const tc = useTranslations("common");
  const tFaq = useTranslations("marketing");

  const faqs = tFaq.raw("pricingFaqs") as { q: string; a: string }[];

  return (
    <>
      <header className="mkt-wrap mkt-page-hero">
        <p className="mkt-brand mkt-brand-sm">{tc("productName")}</p>
        <h1 className="mkt-h1 mt-4 max-w-4xl">{t("title")}</h1>
        <p className="mkt-lead mt-5">{t("lead")}</p>
      </header>

      <section className="mkt-wrap pb-[clamp(3rem,7vw,5.5rem)]">
        <PricingPlans signedIn={signedIn} />
      </section>

      <section className="mkt-section pt-0">
        <div className="mkt-wrap grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="mkt-kicker">{t("billingKicker")}</p>
            <h2 className="mkt-h2 mt-3">{t("billingTitle")}</h2>
            <p className="mkt-lead mt-4">{t("billingLead")}</p>
          </div>
          <MarketingFaq items={faqs} />
        </div>
      </section>

      <FinalCta signedIn={signedIn} />
    </>
  );
}
