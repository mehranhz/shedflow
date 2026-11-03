import type { DefaultSession } from "next-auth";

import type { ActorType } from "@/lib/portal/jwt-claims";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

declare module "next-auth" {
  /** Shape returned by `auth()` / `useSession()`. */
  interface Session {
    accessToken?: string;
    orgId?: string;
    role?: OrgRole;
    impersonatingOrgId?: string;
    actorType?: ActorType;
    customerOrgId?: string;
    customerId?: string;
    user: {
      id: string;
      phone?: string;
      email?: string | null;
    } & DefaultSession["user"];
  }

  /** Object returned from the Credentials `authorize` callback. */
  interface User {
    phone?: string;
    email?: string | null;
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    phone?: string;
    email?: string | null;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    orgId?: string;
    role?: OrgRole;
    impersonatingOrgId?: string;
    actorType?: ActorType;
    customerOrgId?: string;
    customerId?: string;
    error?: string;
  }
}
