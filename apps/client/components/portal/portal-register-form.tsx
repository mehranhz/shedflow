"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
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

import { registerCustomer } from "@/lib/portal/customer-auth-api";
import { postCustomerLoginPath } from "@/lib/portal/routing";

export function PortalRegisterForm() {
  const t = useTranslations("portal.register");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const prefilled = searchParams.get("phone");
    if (prefilled) {
      setPhone(prefilled);
    }
  }, [searchParams]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const session = await registerCustomer({ phone, password, name: name || undefined });
        const result = await signIn("customer-portal", {
          phone,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          redirect: false,
        });
        if (!result || result.error) {
          setError(t("failedFallback"));
          return;
        }
        router.push(postCustomerLoginPath(next));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("failedFallback"));
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
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        />
      </div>

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
          autoComplete="new-password"
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
        {t("hasAccount")}{" "}
        <Link href="/portal/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("logIn")}
        </Link>
      </p>
    </form>
  );
}
