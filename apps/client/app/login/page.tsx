import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your SchedFlow account.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
