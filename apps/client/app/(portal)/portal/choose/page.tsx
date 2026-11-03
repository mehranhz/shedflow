import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { PortalChoosePanel } from "@/components/portal/portal-choose-panel";

export default async function PortalChoosePage() {
  const t = await getTranslations("portal.choose");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <PortalChoosePanel />
    </AuthShell>
  );
}
