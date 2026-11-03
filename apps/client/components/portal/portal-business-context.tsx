"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { CustomerBusiness } from "@/lib/portal/customer-auth-api";
import { fetchCustomerMe, switchCustomerBusiness } from "@/lib/portal/customer-api";
import { writePortalUiPrefs } from "@/components/portal/offline-banner";

type PortalBusinessContextValue = {
  businesses: CustomerBusiness[];
  activeBusiness: CustomerBusiness | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchBusiness: (organizationId: string) => Promise<void>;
};

const PortalBusinessContext = createContext<PortalBusinessContextValue | null>(null);

export function PortalBusinessProvider({
  children,
  initialBusinesses,
  initialActiveOrgId,
}: {
  children: ReactNode;
  initialBusinesses: CustomerBusiness[];
  initialActiveOrgId?: string | null;
}) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const t = useTranslations("portal.errors");
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [activeOrgId, setActiveOrgId] = useState(
    initialActiveOrgId ?? session?.customerOrgId ?? initialBusinesses[0]?.organizationId,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.organizationId === activeOrgId) ?? businesses[0] ?? null,
    [activeOrgId, businesses],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchCustomerMe();
      setBusinesses(me.businesses ?? []);
      if (me.activeCustomerOrgId) {
        setActiveOrgId(me.activeCustomerOrgId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadBusinesses"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const switchBusiness = useCallback(
    async (organizationId: string) => {
      if (organizationId === activeOrgId) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const accessToken = await switchCustomerBusiness(organizationId);
        await update({ accessToken });
        setActiveOrgId(organizationId);
        writePortalUiPrefs({ lastActiveOrgId: organizationId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("switchBusiness"));
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, router, t, update],
  );

  const value = useMemo(
    () => ({
      businesses,
      activeBusiness,
      loading,
      error,
      refresh,
      switchBusiness,
    }),
    [activeBusiness, businesses, error, loading, refresh, switchBusiness],
  );

  return (
    <PortalBusinessContext.Provider value={value}>{children}</PortalBusinessContext.Provider>
  );
}

export function usePortalBusiness(): PortalBusinessContextValue {
  const ctx = useContext(PortalBusinessContext);
  if (!ctx) {
    throw new Error("usePortalBusiness must be used within PortalBusinessProvider");
  }
  return ctx;
}
