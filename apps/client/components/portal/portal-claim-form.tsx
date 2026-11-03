"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
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

import {
  confirmCustomerClaim,
  requestCustomerClaim,
} from "@/lib/portal/customer-auth-api";

export function PortalClaimForm() {
  const t = useTranslations("portal.claim");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") ?? "";
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [token, setToken] = useState(tokenFromQuery);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
  }, [emailFromQuery]);

  const requestClaim = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await requestCustomerClaim(email);
        setMessage(t("checkEmail"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("requestFailed"));
      }
    });
  };

  const confirmClaim = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const session = await confirmCustomerClaim(token);
        const result = await signIn("customer-portal", {
          email: session.user.email ?? email,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          redirect: false,
        });
        if (!result || result.error) {
          setError(t("confirmFailed"));
          return;
        }
        router.push("/portal");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("confirmFailed"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("requestTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("requestBody")}</p>
        {message ? (
          <Alert>
            <AlertTitle>{t("sentTitle")}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error && !token ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="claim-email">{t("email")}</Label>
          <Input
            id="claim-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
          />
        </div>
        <Button type="button" className="min-h-11" disabled={isPending || !email} onClick={requestClaim}>
          {t("sendLink")}
        </Button>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">{t("confirmTitle")}</h2>
        <form onSubmit={confirmClaim} className="flex flex-col gap-4">
          {error && token ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="claim-token">{t("token")}</Label>
            <Input
              id="claim-token"
              value={token}
              required
              onChange={(event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value)}
            />
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending || !token}>
            {t("confirm")}
          </Button>
        </form>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/portal/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
