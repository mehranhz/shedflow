import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookingResult } from "@/components/booking/booking-result";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.result.success");
  return { title: t("metaTitle") };
}

export default async function BookingSuccessPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <BookingResult uid={bookingUid} variant="success" />
    </Suspense>
  );
}
