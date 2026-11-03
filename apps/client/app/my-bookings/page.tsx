import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { MyBookingsList } from "./my-bookings-list";

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login?callbackUrl=/my-bookings");
  }

  return <MyBookingsList />;
}
