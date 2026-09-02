import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Shape returned by `auth()` / `useSession()`. */
  interface Session {
    accessToken: string;
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  /** Object returned from the Credentials `authorize` callback. */
  interface User {
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
  }
}
