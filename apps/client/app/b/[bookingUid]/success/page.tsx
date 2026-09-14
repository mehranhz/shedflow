import { Suspense } from "react";

import { BookingResult } from "@/components/booking/booking-result";

export default async function BookingSuccessPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  return (
    <Suspense>
      <BookingResult
        uid={bookingUid}
        title="You are scheduled"
        description="A calendar invitation has been sent to your email address."
      />
    </Suspense>
  );
}
