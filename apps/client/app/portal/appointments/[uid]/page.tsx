export default async function PortalAppointmentStubPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Appointment</h1>
      <p className="text-sm text-muted-foreground">
        Detail for <code>{uid}</code> — full view lands with T-050. Active org
        context was stored for mutations when you tapped from All businesses.
      </p>
    </div>
  );
}
