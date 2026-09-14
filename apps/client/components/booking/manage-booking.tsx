"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { publicScheduling } from "@/lib/scheduling";

export function ManageBooking({ uid }: { uid: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["public-booking", uid],
    queryFn: () => publicScheduling.getBooking(uid),
  });
  const booking = query.data?.data;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>Manage booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {booking ? (
            <>
              <p className="text-lg font-semibold">
                {booking.eventType?.title ?? "Meeting"}
              </p>
              <p>{new Date(booking.startAt).toLocaleString()}</p>
              <StatusBadge status={booking.status} />
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline">
                  <Link href={`/b/${uid}/reschedule?token=${token}`}>Reschedule</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Cancel</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The time will be released for others to book.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                      placeholder="Reason (optional)"
                      value={reason}
                      onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setReason(event.target.value)}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep meeting</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await publicScheduling.cancel(uid, token, reason);
                            toast.success("Meeting canceled");
                            router.push(`/b/${uid}/cancel?token=${token}`);
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Could not cancel",
                            );
                          }
                        }}
                      >
                        Cancel meeting
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Loading booking…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
