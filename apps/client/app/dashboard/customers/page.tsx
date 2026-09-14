"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/query-state";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function CustomersPage() {
  const { organization, profile } = useOrg();
  const query = useQuery({
    queryKey: ["customers", organization.id],
    queryFn: () => schedulingApi.listCustomers(organization, profile.id),
  });
  const items = query.data?.data.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="People who have booked with this workspace."
      />
      {query.isLoading ? <TableSkeleton /> : null}
      {query.data && items.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Invitees appear here after their first booking."
        />
      ) : null}
      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:text-primary"
                      href={`/dashboard/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>{customer.phone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
