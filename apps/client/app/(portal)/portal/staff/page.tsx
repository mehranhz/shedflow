import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@shedflow/ui/components";

export default async function PortalStaffInterstitialPage() {
  const t = await getTranslations("portal.staff");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("body")}</p>
        <Button asChild className="min-h-11">
          <Link href="/dashboard">{t("dashboard")}</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/portal/login">{t("customerLogin")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
