import type { Metadata, Viewport } from "next";

import { PortalOfflineBanner } from "@/components/portal/offline-banner";
import { PortalPwaRegister } from "@/components/portal/pwa-register";

export const metadata: Metadata = {
  title: "SchedFlow Portal",
  description: "Manage your appointments across businesses.",
  manifest: "/portal/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SchedFlow",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/portal/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/portal/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/portal/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

/**
 * Minimal portal chrome for PWA + multi-biz (Wave 16). Wave 10 owns the full
 * mobile shell — integrate, do not replace, when that lands.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-teal-50 to-white">
      <PortalPwaRegister />
      <PortalOfflineBanner />
      <header className="border-b border-teal-100/80 px-4 py-3">
        <p className="text-lg font-semibold tracking-tight text-teal-900">SchedFlow</p>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
