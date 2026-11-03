"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, CreditCard, Home, UserRound } from "lucide-react";
import { cn } from "@shedflow/ui/lib/utils";

const tabs = [
  { href: "/portal", key: "home", icon: Home, exact: true },
  { href: "/portal/appointments", key: "appointments", icon: CalendarDays },
  { href: "/portal/payments", key: "payments", icon: CreditCard },
  { href: "/portal/account", key: "account", icon: UserRound },
] as const;

export function PortalBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("portal.nav");

  return (
    <nav
      aria-label={t("primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map(({ href, key, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" aria-hidden />
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
