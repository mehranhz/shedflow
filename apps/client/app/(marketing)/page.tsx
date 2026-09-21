import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { HomePage } from "@/components/marketing/home-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.site");
  const tc = await getTranslations("common");

  return {
    title: {
      absolute: `${tc("productName")} — ${t("tagline")}`,
    },
    description: t("description"),
  };
}

export default async function MarketingHomePage() {
  const session = await auth();
  return <HomePage signedIn={Boolean(session)} />;
}
