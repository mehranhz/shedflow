"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Separator,
} from "@shedflow/ui/components";
import { CalendarDays, CreditCard, Home, UserRound } from "lucide-react";
import { cn } from "@shedflow/ui/lib/utils";

import { SkipLink } from "@/components/skip-link";
import { PortalOfflineBanner } from "@/components/portal/offline-banner";
import { PortalPwaRegister } from "@/components/portal/pwa-register";
import { BusinessSwitcherSheet } from "@/components/portal/business-switcher-sheet";
import { PortalBottomNav } from "@/components/portal/portal-bottom-nav";
import { PortalAnalyticsBridge } from "@/components/portal/portal-analytics-bridge";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { brandStyle } from "@/lib/booking-brand";
import { isAppLocale, writeLocaleCookie } from "@/i18n/config";

const desktopLinks = [
  { href: "/portal", key: "home", icon: Home, exact: true },
  { href: "/portal/appointments", key: "appointments", icon: CalendarDays, exact: false },
  { href: "/portal/payments", key: "payments", icon: CreditCard, exact: false },
  { href: "/portal/account", key: "account", icon: UserRound, exact: false },
] as const satisfies readonly { href: string; key: string; icon: typeof Home; exact?: boolean }[];

export function PortalShell({
  children,
  locale,
  reduceMotion = false,
  denseText = false,
}: {
  children: React.ReactNode;
  locale?: string | null;
  reduceMotion?: boolean;
  denseText?: boolean;
}) {
  const t = useTranslations("portal.shell");
  const nav = useTranslations("portal.nav");
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale();
  const { data: session } = useSession();
  const { activeBusiness } = usePortalBusiness();
  const [, startTransition] = useTransition();
  const syncedLocale = useRef(false);

  useEffect(() => {
    if (syncedLocale.current || !isAppLocale(locale)) {
      return;
    }
    syncedLocale.current = true;
    if (locale === currentLocale) {
      return;
    }
    writeLocaleCookie(locale);
    startTransition(() => {
      router.refresh();
    });
  }, [currentLocale, locale, router, startTransition]);

  const brand = activeBusiness?.brandColor;
  const initials =
    (session?.user?.email?.[0] ?? session?.user?.phone?.[0] ?? "U").toUpperCase();

  return (
    <div
      key={activeBusiness?.organizationId ?? "none"}
      className="portal-shell flex min-h-dvh flex-col bg-background transition-colors duration-300"
      style={brandStyle(brand)}
      data-reduce-motion={reduceMotion ? "reduce" : "off"}
      data-dense-text={denseText ? "true" : "false"}
      data-high-contrast="system"
    >
      <PortalAnalyticsBridge />
      <PortalPwaRegister />
      <PortalOfflineBanner />
      <SkipLink href="#portal-main" />
      <header
        className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <BusinessSwitcherSheet />
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="size-11" asChild>
              <Link href="/portal/account" aria-label={nav("account")}>
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Link>
            </Button>
          </div>
        </div>
        {brand ? (
          <div className="h-0.5 w-full bg-[var(--brand)]" aria-hidden />
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-0 md:gap-6">
        <aside className="hidden w-52 shrink-0 md:block md:py-6 md:pl-4">
          <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("menu")}
          </p>
          <nav aria-label={nav("primary")}>
            <ul className="space-y-1">
              {desktopLinks.map(({ href, key, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium",
                        active
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="size-4" aria-hidden />
                      {nav(key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Separator className="my-4" />
          <p className="px-2 text-xs text-muted-foreground">{t("desktopHint")}</p>
        </aside>

        <main
          id="portal-main"
          className="mx-auto w-full max-w-lg flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:max-w-none md:pb-6"
        >
          {children}
        </main>
      </div>

      <PortalBottomNav />
    </div>
  );
}
