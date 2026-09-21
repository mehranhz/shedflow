import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { RESERVED_PUBLIC_SLUGS } from "@/lib/public-routes";

export default async function PublicOrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  if (RESERVED_PUBLIC_SLUGS.has(orgSlug)) {
    notFound();
  }
  return children;
}
