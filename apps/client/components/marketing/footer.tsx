"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { Logo } from "@/components/logo";

import { footerAudienceIds } from "./copy";

export function MarketingFooter() {
  const t = useTranslations("marketing.footer");
  const tn = useTranslations("nav");

  return (
    <footer className="mkt-footer">
      <div className="mkt-wrap">
        <div className="mkt-footer-grid">
          <div>
            <Link href="/" className="mkt-logo" aria-label={tn("homeAria")}>
              <Logo />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("blurb")}
            </p>
            <div className="mt-4">
              <LocaleSwitcher />
            </div>
          </div>
          <div>
            <h2>{t("product")}</h2>
            <ul>
              <li>
                <Link href="/features">{tn("features")}</Link>
              </li>
              <li>
                <Link href="/pricing">{tn("pricing")}</Link>
              </li>
              <li>
                <Link href="/#how">{tn("howItWorks")}</Link>
              </li>
              <li>
                <Link href="/#payments">{tn("payments")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t("account")}</h2>
            <ul>
              <li>
                <Link href="/login">{tn("logIn")}</Link>
              </li>
              <li>
                <Link href="/register">{tn("getStarted")}</Link>
              </li>
              <li>
                <Link href="/dashboard">{tn("dashboard")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t("builtFor")}</h2>
            <ul>
              {footerAudienceIds.map((id) => (
                <li key={id}>
                  <span className="inline-flex min-h-9 items-center text-sm text-muted-foreground">
                    {t(`audiences.${id}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mkt-footer-meta">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/privacy" className="underline-offset-2 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-2 hover:underline">
              Terms
            </Link>
            <span>{t("meta")}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
