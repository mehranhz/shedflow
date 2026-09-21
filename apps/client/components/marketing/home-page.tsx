"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@shedflow/ui/components";

import { BookingVisual } from "./booking-visual";
import {
  bentoMeta,
  paymentRowIds,
  personaIds,
  statIds,
  stepIds,
} from "./copy";
import { PrimaryCta } from "./cta-buttons";
import { MarketingFaq } from "./faq";
import { FinalCta } from "./final-cta";
import { BentoVisual } from "./mini-visuals";
import { PlanCard } from "./plan-card";

export function HomePage({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("marketing.home");
  const tc = useTranslations("common");
  const tCta = useTranslations("marketing.cta");
  const tPersona = useTranslations("marketing.personas");
  const tStats = useTranslations("marketing.stats");
  const tBento = useTranslations("marketing.bento");
  const tSteps = useTranslations("marketing.steps");
  const tPay = useTranslations("marketing.paymentRows");
  const tMarketing = useTranslations("marketing");
  const faqs = tMarketing.raw("homeFaqs") as { q: string; a: string }[];

  return (
    <>
      <section className="mkt-wrap mkt-hero" aria-labelledby="mkt-hero-brand">
        <div className="mkt-hero-copy">
          <p id="mkt-hero-brand" className="mkt-brand">
            {tc("productName")}
          </p>
          <h1 className="mkt-h1 mt-5">
            {t("heroTitle")}
            <span className="mkt-h1-accent">{t("heroAccent")}</span>
          </h1>
          <p className="mkt-lead mt-5">{t("heroLead")}</p>
          <div className="mkt-actions">
            <PrimaryCta signedIn={signedIn} />
            <Button size="lg" variant="outline" className="min-h-11" asChild>
              <Link href="/pricing">{tCta("seePricing")}</Link>
            </Button>
          </div>
          <p className="mkt-hero-note">{t("heroNote")}</p>
        </div>
        <div className="mkt-stage">
          <p className="sr-only">{t("heroVisualSr")}</p>
          <BookingVisual />
        </div>
      </section>

      <section aria-label={t("personasAria")} className="mkt-marquee">
        <div className="mkt-marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-2.5" aria-hidden={copy === 1}>
              {personaIds.map((id) => {
                const role = tPersona(`${id}.role`);
                return (
                  <article key={`${copy}-${id}`} className="mkt-persona">
                    <span className="mkt-persona-mark">{role[0]}</span>
                    <p>
                      <strong>{role}</strong>
                      <span>{tPersona(`${id}.offer`)}</span>
                    </p>
                    <em>{tPersona(`${id}.price`)}</em>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="mkt-section-tight" aria-label={t("statsAria")}>
        <div className="mkt-wrap">
          <dl className="mkt-stats mkt-stats-band">
            {statIds.map((id) => (
              <div key={id}>
                <dt>{tStats(`${id}.value`)}</dt>
                <dd>{tStats(`${id}.label`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="product" className="mkt-section pt-0">
        <div className="mkt-wrap">
          <div className="mkt-reveal max-w-2xl">
            <p className="mkt-kicker">{t("productKicker")}</p>
            <h2 className="mkt-h2 mt-3">{t("productTitle")}</h2>
            <p className="mkt-lead mt-4">{t("productLead")}</p>
          </div>
          <div className="mkt-bento mt-10">
            {bentoMeta.map((tile) => (
              <article
                key={tile.id}
                className={`mkt-tile mkt-reveal ${tile.span}`}
              >
                <h3>{tBento(`${tile.id}.title`)}</h3>
                <p>{tBento(`${tile.id}.body`)}</p>
                <BentoVisual visual={tile.visual} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mkt-section">
        <div className="mkt-wrap mkt-how">
          <div>
            <p className="mkt-kicker">{t("howKicker")}</p>
            <h2 className="mkt-h2 mt-3">{t("howTitle")}</h2>
            <ol className="mkt-steps mt-8">
              {stepIds.map((id) => (
                <li className="mkt-step mkt-reveal" key={id}>
                  <span className="mkt-step-n">{`0${id}`}</span>
                  <div>
                    <h3>{tSteps(`${id}.title`)}</h3>
                    <p>{tSteps(`${id}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="mkt-how-stage">
            <BookingVisual />
          </div>
        </div>
      </section>

      <section id="payments" className="mkt-section">
        <div className="mkt-wrap mkt-split">
          <div className="mkt-reveal">
            <p className="mkt-kicker">{t("paymentsKicker")}</p>
            <h2 className="mkt-h2 mt-3">{t("paymentsTitle")}</h2>
            <p className="mkt-lead mt-4">{t("paymentsLead")}</p>
          </div>
          <div className="mkt-flow mkt-reveal">
            {paymentRowIds.map((id) => (
              <div className="mkt-flow-row" key={id}>
                <span className="mkt-flow-n">{`0${id}`}</span>
                <div>
                  <h3>{tPay(`${id}.title`)}</h3>
                  <p>{tPay(`${id}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mkt-section">
        <div className="mkt-wrap">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="mkt-reveal max-w-2xl">
              <p className="mkt-kicker">{t("plansKicker")}</p>
              <h2 className="mkt-h2 mt-3">{t("plansTitle")}</h2>
              <p className="mkt-lead mt-4">{t("plansLead")}</p>
            </div>
            <Button variant="outline" className="min-h-11" asChild>
              <Link href="/pricing">
                {tCta("fullComparison")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mkt-teaser mt-10">
            <PlanCard variant="free" signedIn={signedIn} />
            <PlanCard variant="pro" signedIn={signedIn} yearly />
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-wrap grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="mkt-reveal">
            <p className="mkt-kicker">{t("faqKicker")}</p>
            <h2 className="mkt-h2 mt-3">{t("faqTitle")}</h2>
            <p className="mkt-lead mt-4">{t("faqLead")}</p>
          </div>
          <MarketingFaq items={faqs} />
        </div>
      </section>

      <FinalCta signedIn={signedIn} />
    </>
  );
}
