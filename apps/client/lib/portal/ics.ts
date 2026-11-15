export function downloadIcs(booking: {
  uid: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string | null;
}): void {
  const stamp = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SchedFlow//Portal//EN",
    "BEGIN:VEVENT",
    `UID:${booking.uid}@shedflow`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(booking.startAt)}`,
    `DTEND:${stamp(booking.endAt)}`,
    `SUMMARY:${booking.title.replace(/\r?\n/g, " ")}`,
    booking.location ? `LOCATION:${booking.location.replace(/\r?\n/g, " ")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${booking.uid}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}
