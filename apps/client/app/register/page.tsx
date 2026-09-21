import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  const t = await getTranslations("auth.register");

  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <RegisterForm />
    </AuthShell>
  );
}
