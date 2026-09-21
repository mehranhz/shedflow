import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailStatus } from "./verify-email-status";

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth.verify");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={null}>
        <VerifyEmailStatus />
      </Suspense>
    </AuthShell>
  );
}
