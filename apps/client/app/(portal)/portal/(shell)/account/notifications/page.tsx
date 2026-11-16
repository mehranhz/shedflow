import { getTranslations } from "next-intl/server";

import { PortalNotificationsForm } from "@/components/portal/portal-notifications-form";

export default async function PortalNotificationsPage() {
  const t = await getTranslations("portal.account.notifications");

  return (
    <section className="space-y-4" aria-labelledby="portal-notifications-heading">
      <div>
        <h1 id="portal-notifications-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalNotificationsForm />
    </section>
  );
}
