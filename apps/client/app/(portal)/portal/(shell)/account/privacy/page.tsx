import { getTranslations } from "next-intl/server";

import { PortalPrivacyForm } from "@/components/portal/portal-privacy-form";

export default async function PortalPrivacyPage() {
  const t = await getTranslations("portal.account.privacy");

  return (
    <section className="space-y-4" aria-labelledby="portal-privacy-heading">
      <div>
        <h1 id="portal-privacy-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalPrivacyForm />
    </section>
  );
}
