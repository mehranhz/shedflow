"use client";

import { useTranslations } from "next-intl";

import { featureDeepMeta } from "./copy";
import { FinalCta } from "./final-cta";
import { FeatureVisual } from "./mini-visuals";

export function FeaturesPage({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("marketing.featuresPage");
  const tc = useTranslations("common");
  const tDeep = useTranslations("marketing.featureDeep");

  return (
    <>
      <header className="mkt-wrap mkt-page-hero">
        <p className="mkt-brand mkt-brand-sm">{tc("productName")}</p>
        <h1 className="mkt-h1 mt-4 max-w-4xl">{t("title")}</h1>
        <p className="mkt-lead mt-5">{t("lead")}</p>
      </header>

      <div className="mkt-wrap pb-[clamp(2rem,6vw,4rem)]">
        {featureDeepMeta.map((chapter, index) => {
          const points = tDeep.raw(`${chapter.id}.points`) as string[];
          return (
            <section
              key={chapter.id}
              className="mkt-feature-block mkt-reveal"
              aria-labelledby={`feature-${index}`}
            >
              <div className="mkt-feature-copy">
                <p className="mkt-kicker">{tDeep(`${chapter.id}.kicker`)}</p>
                <h2 id={`feature-${index}`} className="mkt-h2 mt-3">
                  {tDeep(`${chapter.id}.title`)}
                </h2>
                <p className="mkt-lead mt-4">{tDeep(`${chapter.id}.body`)}</p>
                <ul className="mkt-points">
                  {points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="mkt-feature-viz">
                <FeatureVisual visual={chapter.visual} />
              </div>
            </section>
          );
        })}
      </div>

      <FinalCta signedIn={signedIn} />
    </>
  );
}
