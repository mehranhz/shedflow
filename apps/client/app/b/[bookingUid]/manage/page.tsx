import { Suspense } from "react";

import { ManageBooking } from "@/components/booking/manage-booking";

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
