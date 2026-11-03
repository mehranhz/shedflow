import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { PortalRegisterForm } from "@/components/portal/portal-register-form";
import { isCustomerSession } from "@/lib/portal/routing";

export default async function PortalRegisterPage() {
  const session = await auth();
  if (session?.accessToken && isCustomerSession(session)) {
    redirect("/portal");
  }

  const t = await getTranslations("portal.register");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={null}>
        <PortalRegisterForm />
      </Suspense>
    </AuthShell>
  );
}
