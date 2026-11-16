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

import { ClientApiError } from "@/lib/http";
import {
  completeCustomerMfaLogin,
  loginCustomer,
} from "@/lib/portal/customer-auth-api";
import { postCustomerLoginPath } from "@/lib/portal/routing";

export function PortalLoginForm() {
  const t = useTranslations("portal.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const session = mfaToken
          ? await completeCustomerMfaLogin(mfaToken, code.trim())
          : await loginCustomer(phone, password);
        if ("mfaRequired" in session) {
          setMfaToken(session.mfaToken);
          return;
        }
        const result = await signIn("customer-portal", {
          phone,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          redirect: false,
        });
        if (!result || result.error) {
          setError(t("invalidCredentials"));
          return;
        }
        router.push(postCustomerLoginPath(next));
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof ClientApiError && caught.status === 429
            ? t("mfaInvalid")
            : mfaToken
              ? t("mfaInvalid")
              : t("invalidCredentials"),
        );
      }
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
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          value={phone}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)}
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

      {mfaToken ? (
        <div className="grid gap-2">
          <Label htmlFor="mfa-code">{t("mfaCode")}</Label>
          <Input
            id="mfa-code"
            name="code"
            autoComplete="one-time-code"
            required
            value={code}
            aria-describedby="mfa-hint"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value)}
          />
          <p id="mfa-hint" className="text-sm text-muted-foreground">
            {t("mfaHint")}
          </p>
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="min-h-11">
        {isPending ? t("submitting") : mfaToken ? t("mfaSubmit") : t("submit")}
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
