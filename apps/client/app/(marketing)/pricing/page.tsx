import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { PricingPage } from "@/components/marketing/pricing-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pricingPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function PricingRoute() {
  const session = await auth();
  return <PricingPage signedIn={Boolean(session)} />;
}
