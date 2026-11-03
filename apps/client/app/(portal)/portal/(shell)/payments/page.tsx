import { getTranslations } from "next-intl/server";

import { PortalEmptyState } from "@/components/portal/portal-states";

export default async function PortalPaymentsPage() {
  const t = await getTranslations("portal.payments");

  return (
    <section className="space-y-4" aria-labelledby="portal-payments-heading">
      <div>
        <h1 id="portal-payments-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalEmptyState title={t("emptyTitle")} description={t("emptyBody")} />
    </section>
  );
}
