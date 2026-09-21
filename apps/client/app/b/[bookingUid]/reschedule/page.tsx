import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RescheduleBooking } from "@/components/booking/reschedule-booking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("booking.reschedule");
  return { title: t("metaTitle") };
}

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <div className="min-h-svh bg-[#f4f5f7] px-4 py-12">
      <Suspense>
        <RescheduleBooking uid={bookingUid} />
      </Suspense>
    </div>
  );
}
