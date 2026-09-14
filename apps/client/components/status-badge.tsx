import { Badge } from "@shedflow/ui/components";

import type { BookingStatus } from "@/lib/types";

const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: "Confirmed",
  PENDING_PAYMENT: "Pending payment",
  PENDING_CONFIRMATION: "Pending",
  CANCELLED: "Canceled",
  RESCHEDULED: "Rescheduled",
  EXPIRED: "Expired",
  NO_SHOW: "No-show",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const label = STATUS_LABEL[status];
  if (status === "CONFIRMED") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        {label}
      </Badge>
    );
  }
  if (status === "PENDING_PAYMENT" || status === "PENDING_CONFIRMATION") {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      {label}
    </Badge>
  );
}
