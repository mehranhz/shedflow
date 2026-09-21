import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.reset");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
