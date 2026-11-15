import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PortalProfileForm } from "@/components/portal/portal-profile-form";

export default async function PortalProfilePage() {
  const t = await getTranslations("portal.account.profile");

  return (
    <section className="space-y-4" aria-labelledby="portal-profile-heading">
      <div>
        <h1 id="portal-profile-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}
      >
        <PortalProfileForm />
      </Suspense>
    </section>
  );
}
