"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { trackPortalEvent } from "@/lib/portal/analytics";
import { usePortalBusiness } from "@/components/portal/portal-business-context";

export function PortalAnalyticsBridge() {
  const pathname = usePathname();
  const { activeBusiness } = usePortalBusiness();

  useEffect(() => {
    trackPortalEvent("portal_view", {
      path: pathname,
      organization_id: activeBusiness?.organizationId,
    });
  }, [pathname, activeBusiness?.organizationId]);

  return null;
}
