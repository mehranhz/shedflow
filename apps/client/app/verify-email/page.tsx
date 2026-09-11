import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailStatus } from "./verify-email-status";

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirm your address to finish setting up your account."
    >
      <Suspense fallback={null}>
        <VerifyEmailStatus />
      </Suspense>
    </AuthShell>
  );
}
