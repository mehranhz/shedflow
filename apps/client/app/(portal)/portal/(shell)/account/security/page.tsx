import { getTranslations } from "next-intl/server";

import { PortalSecurityForm } from "@/components/portal/portal-security-form";

export default async function PortalSecurityPage() {
  const t = await getTranslations("portal.account.security");

  return (
    <section className="space-y-4" aria-labelledby="portal-security-heading">
      <div>
        <h1 id="portal-security-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalSecurityForm />
    </section>
  );
}
