import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingResult } from "@/components/booking/booking-result";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.result.cancelled");
  return { title: t("metaTitle") };
}

export default async function CancelledPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <BookingResult uid={bookingUid} variant="cancelled" />
    </Suspense>
  );
}
