"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@shedflow/ui/components";

export function PrimaryCta({
  signedIn,
  size = "lg",
  className,
}: {
  signedIn: boolean;
  size?: "lg" | "default";
  className?: string;
}) {
  const t = useTranslations("marketing.cta");

  return (
    <Button size={size} className={className} asChild>
      <Link href={signedIn ? "/dashboard" : "/register"}>
        {signedIn ? t("openDashboard") : t("signUpFree")}
      </Link>
    </Button>
  );
}

export function SecondaryCta({
  signedIn,
  size = "lg",
  className,
}: {
  signedIn: boolean;
  size?: "lg" | "default";
  className?: string;
}) {
  const t = useTranslations("marketing.cta");
  const tn = useTranslations("nav");

  if (signedIn) {
    return (
      <Button size={size} variant="outline" className={className} asChild>
        <Link href="/pricing">{t("viewPricing")}</Link>
      </Button>
    );
  }

  return (
    <Button size={size} variant="outline" className={className} asChild>
      <Link href="/login">{tn("logIn")}</Link>
    </Button>
  );
}
