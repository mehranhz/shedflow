"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@shedflow/ui/components";
import { CheckCircle2 } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { publicScheduling } from "@/lib/scheduling";

export function BookingResult({
  uid,
  title,
  description,
}: {
  uid: string;
  title: string;
  description: string;
}) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
    refetchInterval: 4000,
  });
  const booking = query.data?.data;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-600" />
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm">
          <p className="text-muted-foreground">{description}</p>
          {booking ? (
            <div className="space-y-1">
              <p className="font-medium">{booking.eventType?.title ?? "Meeting"}</p>
              <p>{new Date(booking.startAt).toLocaleString()}</p>
              <StatusBadge status={booking.status} />
            </div>
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/b/${uid}/manage${token ? `?token=${token}` : ""}`}>
              Manage booking
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
