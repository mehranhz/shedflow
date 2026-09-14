import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { OrgEventList } from "@/components/booking/org-event-list";

const RESERVED = new Set([
  "login",
  "register",
  "dashboard",
  "reset-password",
  "verify-email",
  "invite",
  "api",
  "b",
  "embed",
  "app",
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  return { title: orgSlug };
}

export default async function PublicOrgPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  if (RESERVED.has(orgSlug)) {
    notFound();
  }

  return (
    <div className="min-h-svh bg-[#f4f5f7] px-4 py-16">
      <OrgEventList orgSlug={orgSlug} />
    </div>
  );
}
