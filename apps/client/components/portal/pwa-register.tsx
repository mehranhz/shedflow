"use client";

import { useEffect } from "react";

/**
 * Registers the portal-scoped service worker. Must only mount under `/portal/*`
 * so staff `/dashboard` never gets a SW (T-078).
 */
export function PortalPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (!window.location.pathname.startsWith("/portal")) {
      return;
    }
    void navigator.serviceWorker
      .register("/portal/sw.js", { scope: "/portal/" })
      .catch(() => {
        // Registration failures (HTTP, private mode) are non-fatal.
      });
  }, []);

  return null;
}
