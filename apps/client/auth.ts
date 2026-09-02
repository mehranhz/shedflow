import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { API_URL } from "@/lib/config";

type ApiUser = { id: string; email: string; createdAt: string };
type AuthResponse = { accessToken: string; user: ApiUser };

// The NestJS access token expires in 1h; keep the NextAuth session in lockstep
// so the browser session dies together with the token it carries.
const SESSION_MAX_AGE_SECONDS = 60 * 60;

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        // The API returns 401 for bad credentials; anything non-2xx means "no user".
        if (!response.ok) {
          return null;
        }

        const { accessToken, user } = (await response.json()) as AuthResponse;
        return {
          id: user.id,
          email: user.email,
          accessToken,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      // `user` is only present on the sign-in pass; persist what we need onto the
      // encrypted JWT so later requests can authenticate against the API.
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token.id) {
        session.user.id = token.id;
      }
      if (token.accessToken) {
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
});
