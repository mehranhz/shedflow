"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
} from "@shedflow/ui/components";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  if (token) {
    return <SetNewPasswordForm token={token} />;
  }

  return <ForgotPasswordForm />;
}

function ForgotPasswordForm() {
  const t = useTranslations("auth.reset");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message ?? t("sendFailedFallback"));
        return;
      }

      setSent(true);
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("requestFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {sent ? (
        <Alert>
          <AlertTitle>{t("checkEmailTitle")}</AlertTitle>
          <AlertDescription>{t("checkEmailBody")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEmail(event.target.value)}
            />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? t("sending") : t("sendLink")}
          </Button>
        </>
      )}

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {t("remembered")}{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}

function SetNewPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.reset");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message ?? t("resetFailedFallback"));
        return;
      }

      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertTitle>{t("updatedTitle")}</AlertTitle>
          <AlertDescription>{t("updatedBody")}</AlertDescription>
        </Alert>
        <Link href="/login">
          <Button className="w-full">{t("signIn")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("resetFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPassword(event.target.value)}
        />
        <p className="text-xs text-zinc-500">{t("passwordHint")}</p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? t("updating") : t("update")}
      </Button>
    </form>
  );
}
