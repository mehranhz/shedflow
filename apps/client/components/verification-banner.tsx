"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@shedflow/ui/components";

export function VerificationBanner() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onResend = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/resend-verification", {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message ?? "Could not resend the verification text.");
        return;
      }

      setSent(true);
    });
  };

  return (
    <Alert className="mb-6">
      <AlertTitle>Verify your phone</AlertTitle>
      <AlertDescription>
        <p className="mb-3">
          Your account works without verification. Confirm your phone when you
          can so we can reach you about bookings.
        </p>
        {error ? <p className="mb-3 text-destructive">{error}</p> : null}
        {sent ? (
          <p>If you still need to verify, we sent a new link.</p>
        ) : (
          <Button type="button" size="sm" disabled={isPending} onClick={onResend}>
            {isPending ? "Sending…" : "Resend verification text"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
