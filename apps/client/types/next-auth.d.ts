import type { DefaultSession } from "next-auth";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

declare module "next-auth" {
  /** Shape returned by `auth()` / `useSession()`. */
  interface Session {
    accessToken?: string;
    orgId?: string;
    role?: OrgRole;
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  /** Object returned from the Credentials `authorize` callback. */
  interface User {
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    orgId?: string;
    role?: OrgRole;
    error?: string;
  }
}
