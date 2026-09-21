import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ManageBooking } from "@/components/booking/manage-booking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.manage");
  return { title: t("metaTitle") };
}

export default async function ManagePage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <ManageBooking uid={bookingUid} />
    </Suspense>
  );
}
