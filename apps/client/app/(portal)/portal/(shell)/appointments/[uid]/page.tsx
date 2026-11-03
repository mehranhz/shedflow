import { getTranslations } from "next-intl/server";

export default async function PortalAppointmentDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const t = await getTranslations("portal.appointments");

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">{t("detailTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("detailStub")} <code className="text-xs">{uid}</code>
      </p>
    </div>
  );
}
