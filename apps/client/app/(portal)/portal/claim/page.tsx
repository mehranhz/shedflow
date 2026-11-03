import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { PortalClaimForm } from "@/components/portal/portal-claim-form";

export default async function PortalClaimPage() {
  const t = await getTranslations("portal.claim");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={null}>
        <PortalClaimForm />
      </Suspense>
    </AuthShell>
  );
}
