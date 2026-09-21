import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";
import "@/components/marketing/marketing.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.site");
  const tc = await getTranslations("common");

  return {
    title: {
      default: `${tc("productName")} — ${t("tagline")}`,
      template: `%s — ${tc("productName")}`,
    },
    description: t("description"),
  };
}

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const t = await getTranslations("common");

  return (
    <div className="mkt">
      <div className="mkt-mesh" aria-hidden />
      <div className="mkt-grid-bg" aria-hidden />
      <div className="mkt-grain" aria-hidden />
      <a href="#main" className="mkt-skip">
        {t("skipToContent")}
      </a>
      <MarketingNav signedIn={Boolean(session)} />
      <main id="main" className="mkt-main">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
