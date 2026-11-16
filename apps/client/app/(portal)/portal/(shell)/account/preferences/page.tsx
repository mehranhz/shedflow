import { getTranslations } from "next-intl/server";

import { PortalPreferencesForm } from "@/components/portal/portal-preferences-form";

export default async function PortalPreferencesPage() {
  const t = await getTranslations("portal.account.preferences");

  return (
    <section className="space-y-4" aria-labelledby="portal-preferences-heading">
      <div>
        <h1 id="portal-preferences-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalPreferencesForm />
    </section>
  );
}
