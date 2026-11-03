"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
} from "@shedflow/ui/components";

import { postCustomerLoginPath } from "@/lib/portal/routing";

export function PortalLoginForm() {
  const t = useTranslations("portal.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn("customer-portal", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError(t("invalidCredentials"));
        return;
      }

      router.push(postCustomerLoginPath(next));
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("failedTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={isPending} className="min-h-11">
        {isPending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/portal/register" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signUp")}
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        {t("claimPrompt")}{" "}
        <Link href="/portal/claim" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("claimLink")}
        </Link>
      </p>
    </form>
  );
}
