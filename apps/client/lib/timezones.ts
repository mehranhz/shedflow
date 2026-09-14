const cached = new Map<string, string[]>();

export function listTimeZones(): string[] {
  if (cached.has("all")) {
    return cached.get("all") ?? [];
  }
  const values =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC"];
  cached.set("all", values);
  return values;
}

export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function formatTimeZoneLabel(timeZone: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const city = timeZone.split("/").slice(-1)[0]?.replaceAll("_", " ") ?? timeZone;
    return `${city} (${offset})`;
  } catch {
    return timeZone;
  }
}
