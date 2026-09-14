import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Create your free workspace and booking page."
    >
      <RegisterForm />
    </AuthShell>
  );
}
