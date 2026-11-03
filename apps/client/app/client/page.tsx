import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { ClientBookings } from "./client-bookings";

export default async function ClientPage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login?callbackUrl=/client");
  }

  return <ClientBookings />;
}
