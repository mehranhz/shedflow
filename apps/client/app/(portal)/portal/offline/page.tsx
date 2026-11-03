import { getTranslations } from "next-intl/server";

export default async function PortalOfflinePage() {
  const t = await getTranslations("portal.offline");

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
    </div>
  );
}
