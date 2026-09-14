import { Suspense } from "react";

import { RescheduleBooking } from "@/components/booking/reschedule-booking";

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
