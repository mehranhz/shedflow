"use client";

import { Badge } from "@shedflow/ui/components";
import { useTranslations } from "next-intl";

import type { BookingStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("booking.status");
  const label = t(status);

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
