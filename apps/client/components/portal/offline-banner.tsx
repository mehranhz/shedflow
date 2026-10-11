"use client";

import { useEffect, useState } from "react";

const PREFS_KEY = "shedflow.portal.uiPrefs";

export type PortalUiPrefs = {
  lastActiveOrgId?: string;
  reduceMotion?: boolean;
};

export function readPortalUiPrefs(): PortalUiPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PortalUiPrefs;
  } catch {
    return {};
  }
}

export function writePortalUiPrefs(patch: Partial<PortalUiPrefs>): void {
  if (typeof window === "undefined") return;
  const next = { ...readPortalUiPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Shows when `navigator.onLine` is false (T-078). */
export function PortalOfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-700 px-3 py-2 text-center text-sm text-white"
    >
      You are offline. Showing cached shell — appointment data may be out of date.
    </div>
  );
}
