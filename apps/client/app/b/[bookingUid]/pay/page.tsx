import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PayBooking } from "@/components/booking/pay-booking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.pay");
  return { title: t("metaTitle") };
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <PayBooking uid={bookingUid} />
    </Suspense>
  );
}
