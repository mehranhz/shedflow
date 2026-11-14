import type { AuthMembership, AuthProfile, Organization, OrgRole } from "@/lib/types";

type NestMembership = {
  organizationId: string;
  role: OrgRole;
  status: string;
};

type NestProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  createdAt: string;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  memberships?: Array<NestMembership | AuthMembership>;
  activeOrganization: Organization | null;
  impersonatingOrgId?: string | null;
};

function isLaravelMembership(value: NestMembership | AuthMembership): value is AuthMembership {
  return "membership" in value && "name" in value;
}

export function normalizeAuthProfile(
  body: unknown,
  organizations: Organization[] = [],
): AuthProfile | null {
  const payload =
    body && typeof body === "object" && "success" in body
      ? (body as { data?: unknown }).data
      : body;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const profile = payload as NestProfile & Partial<AuthProfile>;
  if (!profile.id) {
    return null;
  }

  const rawMemberships = profile.memberships ?? [];
  if (rawMemberships.length > 0 && isLaravelMembership(rawMemberships[0]!)) {
    return profile as AuthProfile;
  }

  const byId = new Map(organizations.map((org) => [org.id, org]));
  if (profile.activeOrganization) {
    byId.set(profile.activeOrganization.id, profile.activeOrganization);
  }

  const memberships: AuthMembership[] = rawMemberships
    .filter((item): item is NestMembership => "organizationId" in item)
    .map((item) => {
      const org = byId.get(item.organizationId) ?? {
        id: item.organizationId,
        name: item.organizationId,
        slug: "",
        timezone: "UTC",
        locale: "en",
        currency: "USD",
        logoUrl: null,
        brandColor: null,
        platformPlan: "FREE" as const,
        settings: {},
        createdAt: profile.createdAt,
        updatedAt: profile.createdAt,
      };
      return {
        ...org,
        membership: {
          user_id: profile.id,
          organization_id: item.organizationId,
          type: item.role,
          status: item.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        },
      };
    });

  return {
    id: profile.id,
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? null,
    createdAt: profile.createdAt,
    phoneVerifiedAt: profile.phoneVerifiedAt ?? null,
    emailVerifiedAt: profile.emailVerifiedAt ?? null,
    memberships,
    activeOrganization: profile.activeOrganization,
    impersonatingOrgId: profile.impersonatingOrgId ?? null,
  };
}
