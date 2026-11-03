import type { Metadata, Viewport } from "next";

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

/** Metadata + PWA tags only — shell chrome lives in `(shell)/layout` + `PortalShell`. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
