import { Suspense } from "react";

import { BookingResult } from "@/components/booking/booking-result";

export default async function CancelledPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <BookingResult
        uid={bookingUid}
        title="Meeting canceled"
        description="This time is now available for others."
      />
    </Suspense>
  );
}
