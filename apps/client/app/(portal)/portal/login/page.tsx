import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { PortalLoginForm } from "@/components/portal/portal-login-form";
import { isCustomerSession } from "@/lib/portal/routing";

export default async function PortalLoginPage() {
  const session = await auth();
  if (session?.accessToken && isCustomerSession(session)) {
    redirect("/portal");
  }

  const t = await getTranslations("portal.login");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={null}>
        <PortalLoginForm />
      </Suspense>
    </AuthShell>
  );
}
