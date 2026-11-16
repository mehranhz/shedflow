"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@shedflow/ui/components";

import { usePortalBusiness } from "@/components/portal/portal-business-context";

const SECTIONS = [
  {
    titleKey: "sectionProfile",
    items: [
      { href: "/portal/account/profile", labelKey: "editProfile", hintKey: "editProfileHint" },
      { href: "/portal/account/preferences", labelKey: "preferencesLink", hintKey: "preferencesHint" },
    ],
  },
  {
    titleKey: "sectionNotifications",
    items: [
      { href: "/portal/account/notifications", labelKey: "notificationsLink", hintKey: "notificationsHint" },
    ],
  },
  {
    titleKey: "sectionSecurity",
    items: [{ href: "/portal/account/security", labelKey: "securityLink", hintKey: "securityHint" }],
  },
  {
    titleKey: "sectionPrivacy",
    items: [{ href: "/portal/account/privacy", labelKey: "privacyLink", hintKey: "privacyHint" }],
  },
] as const;

export function PortalAccountPanel() {
  const t = useTranslations("portal.account");
  const { data: session } = useSession();
  const { businesses, activeBusiness } = usePortalBusiness();

  const phone = session?.user?.phone;

  return (
    <div className="min-w-0 space-y-6">
      <dl className="space-y-3 rounded-lg border p-4 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("signedInAs")}</dt>
          <dd className="break-all font-medium">{phone ?? t("unknownUser")}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("activeBusiness")}</dt>
          <dd className="break-words font-medium">{activeBusiness?.name ?? t("none")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("linkedBusinesses")}</dt>
          <dd className="font-medium">{businesses.length}</dd>
        </div>
      </dl>

      <nav aria-label={t("sectionsLabel")} className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.titleKey} className="space-y-2" aria-labelledby={`account-${section.titleKey}`}>
            <h2 id={`account-${section.titleKey}`} className="text-sm font-medium text-muted-foreground">
              {t(section.titleKey)}
            </h2>
            <ul className="overflow-hidden rounded-lg border">
              {section.items.map((item) => (
                <li key={item.href} className="border-t first:border-t-0">
                  <Link
                    href={item.href}
                    className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 px-4 py-3 hover:bg-muted/50"
                  >
                    <span className="font-medium">{t(item.labelKey)}</span>
                    <span className="text-sm text-muted-foreground">{t(item.hintKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full"
        onClick={() => void signOut({ callbackUrl: "/portal/login" })}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}
