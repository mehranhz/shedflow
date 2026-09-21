"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { Logo } from "@/components/logo";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@shedflow/ui/components";

import { PrimaryCta } from "./cta-buttons";

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");

  const links = [
    { href: "/features", label: t("features") },
    { href: "/pricing", label: t("pricing") },
    { href: "/#how", label: t("howItWorks") },
  ] as const;

  return (
    <header className="mkt-nav">
      <div className="mkt-wrap mkt-nav-inner">
        <Link href="/" className="mkt-logo" aria-label={t("homeAria")}>
          <Logo />
        </Link>
        <nav className="mkt-nav-links" aria-label={t("marketingAria")}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="mkt-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mkt-nav-cta">
          <LocaleSwitcher compact className="hidden sm:inline-flex items-center" />
          {signedIn ? (
            <Button className="mkt-nav-primary min-h-11" asChild>
              <Link href="/dashboard">{t("goToDashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="mkt-nav-login min-h-11" asChild>
                <Link href="/login">{t("logIn")}</Link>
              </Button>
              <Button className="mkt-nav-primary min-h-11" asChild>
                <Link href="/register">{t("getStarted")}</Link>
              </Button>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="mkt-nav-menu min-h-11 min-w-11"
                aria-label={t("openMenu")}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100%)]">
              <SheetHeader>
                <SheetTitle>{tc("productName")}</SheetTitle>
              </SheetHeader>
              <nav className="mkt-sheet-nav" aria-label={t("mobileAria")}>
                {links.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </SheetClose>
                ))}
                {signedIn ? (
                  <SheetClose asChild>
                    <Link href="/dashboard">{t("dashboard")}</Link>
                  </SheetClose>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Link href="/login">{t("logIn")}</Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/register">{t("getStarted")}</Link>
                    </SheetClose>
                  </>
                )}
              </nav>
              <div className="flex flex-col gap-4 px-4 pb-6">
                <LocaleSwitcher />
                <PrimaryCta signedIn={signedIn} className="w-full min-h-11" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
