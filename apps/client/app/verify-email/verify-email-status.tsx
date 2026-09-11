"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@shedflow/ui/components";

type Status = "missing" | "pending" | "success" | "error";

export function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "pending" : "missing");
  const [message, setMessage] = useState(
    "This verification link is missing a token.",
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    async function verify() {
      const response = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setStatus("error");
        setMessage(data.message ?? "This verification link is invalid or expired.");
        return;
      }

      setStatus("success");
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "pending") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Confirming your email…
      </p>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertTitle>Email verified</AlertTitle>
          <AlertDescription>
            Your address is confirmed. You can continue using SchedFlow.
          </AlertDescription>
        </Alert>
        <Link href="/dashboard">
          <Button className="w-full">Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert variant="destructive">
        <AlertTitle>Verification failed</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <Link href="/login">
        <Button variant="outline" className="w-full">
          Back to sign in
        </Button>
      </Link>
    </div>
  );
}
