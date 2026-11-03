import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PortalBusinessProvider } from "@/components/portal/portal-business-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { hasResolvedPortalDualRole } from "@/lib/portal/dual-role";
import { fetchCustomerMeServer } from "@/lib/portal/customer-api-server";
import { readAccessTokenClaims } from "@/lib/portal/jwt-claims";

export default async function PortalAuthenticatedShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/portal/login");
  }

  const claims = readAccessTokenClaims(session.accessToken);
  const isStaff = Boolean(claims.role && claims.orgId);
  const isCustomer =
    claims.actorType === "CUSTOMER" || Boolean(claims.customerOrgId);

  if (isStaff && !isCustomer) {
    redirect("/portal/staff");
  }

  if (isStaff && isCustomer && !(await hasResolvedPortalDualRole())) {
    redirect("/portal/choose");
  }

  const me = await fetchCustomerMeServer();

  return (
    <PortalBusinessProvider
      initialBusinesses={me?.businesses ?? []}
      initialActiveOrgId={me?.activeCustomerOrgId ?? session.customerOrgId}
    >
      <PortalShell>{children}</PortalShell>
    </PortalBusinessProvider>
  );
}
