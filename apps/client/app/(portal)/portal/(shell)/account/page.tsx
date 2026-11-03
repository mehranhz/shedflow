import { getTranslations } from "next-intl/server";

import { PortalAccountPanel } from "@/components/portal/portal-account-panel";

export default async function PortalAccountPage() {
  const t = await getTranslations("portal.account");
  return (
    <section className="space-y-4" aria-labelledby="portal-account-heading">
      <div>
        <h1 id="portal-account-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalAccountPanel />
    </section>
  );
}
