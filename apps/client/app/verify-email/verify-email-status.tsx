"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@shedflow/ui/components";

type Status = "missing" | "pending" | "success" | "error";

export function VerifyEmailStatus() {
  const t = useTranslations("auth.verify");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "pending" : "missing");
  const [message, setMessage] = useState(t("missingToken"));

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
        setMessage(data.message ?? t("invalidToken"));
        return;
      }

      setStatus("success");
    }

    void verify();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-verify when the token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable for message keys
  }, [token]);

  if (status === "pending") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("pending")}</p>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertTitle>{t("successTitle")}</AlertTitle>
          <AlertDescription>{t("successBody")}</AlertDescription>
        </Alert>
        <Link href="/dashboard">
          <Button className="w-full">{t("goDashboard")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert variant="destructive">
        <AlertTitle>{t("failedTitle")}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <Link href="/login">
        <Button variant="outline" className="w-full">
          {t("backToSignIn")}
        </Button>
      </Link>
    </div>
  );
}
