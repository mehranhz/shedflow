"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@shedflow/ui/components";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { organization, profile } = useOrg();
  const customers = useQuery({
    queryKey: ["customers", organization.id],
    queryFn: () => schedulingApi.listCustomers(organization, profile.id),
  });
  const bookings = useQuery({
    queryKey: ["bookings", organization.id],
    queryFn: () => schedulingApi.listBookings(organization, profile.id),
  });
  const customer = customers.data?.data.items.find((item) => item.id === id);
  const history = (bookings.data?.data.items ?? []).filter(
    (booking) => booking.customerId === id,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer?.name ?? "Contact"}
        description={customer?.email}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking history</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            history.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{booking.eventType?.title ?? "Meeting"}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(booking.startAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
