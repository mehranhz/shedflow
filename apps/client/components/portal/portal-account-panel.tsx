"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@shedflow/ui/components";

import { usePortalBusiness } from "@/components/portal/portal-business-context";

export function PortalAccountPanel() {
  const t = useTranslations("portal.account");
  const { data: session } = useSession();
  const { businesses, activeBusiness } = usePortalBusiness();

  const email = session?.user?.email ?? session?.user?.phone;

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("signedInAs")}</dt>
          <dd className="font-medium">{email ?? t("unknownUser")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("activeBusiness")}</dt>
          <dd className="font-medium">{activeBusiness?.name ?? t("none")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("linkedBusinesses")}</dt>
          <dd className="font-medium">{businesses.length}</dd>
        </div>
      </dl>
      <Button asChild className="min-h-11 w-full">
        <Link href="/portal/account/profile">{t("editProfile")}</Link>
      </Button>
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
