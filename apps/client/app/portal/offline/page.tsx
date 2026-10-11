export default function PortalOfflinePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        The SchedFlow portal shell is available offline. Reconnect to load live
        appointments — we never show stale booking times as truth.
      </p>
    </div>
  );
}
