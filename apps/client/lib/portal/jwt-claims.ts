export type ActorType = "STAFF" | "CUSTOMER";

export type AccessClaims = {
  expires?: number;
  id?: string;
  phone?: string;
  email?: string;
  orgId?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  impersonatingOrgId?: string;
  actorType?: ActorType;
  customerOrgId?: string;
  customerId?: string;
};

export function readAccessTokenClaims(accessToken: string): AccessClaims {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) {
      return {};
    }
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    const actorRaw = payload.actorType;
    const actorType =
      actorRaw === "STAFF" || actorRaw === "CUSTOMER" ? actorRaw : undefined;

    return {
      expires:
        typeof payload.exp === "number" ? payload.exp * 1000 : undefined,
      id:
        typeof payload.sub === "string" && payload.sub.length > 0
          ? payload.sub
          : undefined,
      phone:
        typeof payload.phone === "string" && payload.phone.length > 0
          ? payload.phone
          : undefined,
      orgId: typeof payload.orgId === "string" ? payload.orgId : undefined,
      role:
        payload.role === "OWNER" ||
        payload.role === "ADMIN" ||
        payload.role === "MEMBER"
          ? payload.role
          : undefined,
      impersonatingOrgId:
        typeof payload.impersonatingOrgId === "string"
          ? payload.impersonatingOrgId
          : undefined,
      actorType:
        actorType ??
        (typeof payload.orgId === "string" ? "STAFF" : "CUSTOMER"),
      customerOrgId:
        typeof payload.customerOrgId === "string"
          ? payload.customerOrgId
          : undefined,
      customerId:
        typeof payload.customerId === "string" ? payload.customerId : undefined,
    };
  } catch {
    return {};
  }
}
