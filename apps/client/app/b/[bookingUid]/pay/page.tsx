import { redirect } from "next/navigation";

export default async function PayRedirectPage({
  params,
}: {
  params: Promise<{ bookingUid: string }>;
}) {
  const { bookingUid } = await params;
  redirect(`/b/${bookingUid}/success`);
}
