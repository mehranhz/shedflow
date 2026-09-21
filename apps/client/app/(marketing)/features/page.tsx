import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { FeaturesPage } from "@/components/marketing/features-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.featuresPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function FeaturesRoute() {
  const session = await auth();
  return <FeaturesPage signedIn={Boolean(session)} />;
}
