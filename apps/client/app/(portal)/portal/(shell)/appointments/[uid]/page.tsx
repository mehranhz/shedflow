import { PortalAppointmentDetail } from "@/components/portal/portal-appointment-detail";

export default async function PortalAppointmentDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return <PortalAppointmentDetail uid={uid} />;
}
