"use client";

import { createContext, useContext } from "react";

import type { AuthMembership, AuthProfile, Organization, OrgRole } from "@/lib/types";

type OrgContextValue = {
  profile: AuthProfile;
  organization: Organization;
  organizations: AuthMembership[];
  role: OrgRole;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  profile,
  organizations,
  children,
}: {
  profile: AuthProfile;
  organizations: AuthMembership[];
  children: React.ReactNode;
}) {
  const organization = profile.activeOrganization;
  if (!organization) {
    return null;
  }
  const membership = profile.memberships.find(
    (item) => item.id === organization.id,
  );
  const role =
    membership?.membership.type ??
    (profile.impersonatingOrgId === organization.id ? "ADMIN" : "MEMBER");

  return (
    <OrgContext.Provider
      value={{ profile, organization, organizations, role }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return value;
}

export function canManageWorkspace(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
