import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { API_URL } from "@/lib/config";
import { refreshSessionTokens } from "@/lib/refresh-session";

type ApiUser = { id: string; email: string; createdAt: string };
type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
};

type AccessTokenClaims = {
  exp?: number;
  orgId?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
};

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ACCESS_REFRESH_SKEW_MS = 60_000;
const ORG_COOKIE = "sf_org";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.JWT_SECRET,
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

        const { accessToken, refreshToken, user } =
          (await response.json()) as AuthResponse;
        return {
          id: user.id,
          email: user.email,
          accessToken,
          refreshToken,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        applyAccessToken(token, user.accessToken, user.refreshToken);
        await persistOrgCookie(token.orgId);
        delete token.error;
        return token;
      }

      if (
        token.accessToken &&
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires - ACCESS_REFRESH_SKEW_MS
      ) {
        return token;
      }

      if (!token.refreshToken) {
        return {
          ...token,
          accessToken: undefined,
          orgId: undefined,
          role: undefined,
          error: "RefreshTokenError",
        };
      }

      try {
        const rotated = await refreshSessionTokens(
          API_URL,
          token.refreshToken,
          token.orgId,
        );
        applyAccessToken(token, rotated.accessToken, rotated.refreshToken);
        await persistOrgCookie(token.orgId);
        token.error = undefined;
        return token;
      } catch {
        return {
          ...token,
          accessToken: undefined,
          refreshToken: undefined,
          accessTokenExpires: undefined,
          orgId: undefined,
          role: undefined,
          error: "RefreshTokenError",
        };
      }
    },
    session: async ({ session, token }) => {
      if (token.id) {
        session.user.id = token.id;
      }
      if (token.accessToken) {
        session.accessToken = token.accessToken;
      }
      session.orgId = token.orgId;
      session.role = token.role;
      return session;
    },
  },
});

function applyAccessToken(
  token: {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    orgId?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER";
  },
  accessToken?: string,
  refreshToken?: string,
): void {
  if (refreshToken) {
    token.refreshToken = refreshToken;
  }
  if (!accessToken) {
    token.accessToken = undefined;
    token.accessTokenExpires = undefined;
    token.orgId = undefined;
    token.role = undefined;
    return;
  }

  const claims = readAccessTokenClaims(accessToken);
  token.accessToken = accessToken;
  token.accessTokenExpires = claims.expires;
  token.orgId = claims.orgId;
  token.role = claims.role;
}

function readAccessTokenClaims(accessToken: string): {
  expires?: number;
  orgId?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
} {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) {
      return {};
    }
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json) as AccessTokenClaims;
    return {
      expires:
        typeof payload.exp === "number" ? payload.exp * 1000 : undefined,
      orgId: typeof payload.orgId === "string" ? payload.orgId : undefined,
      role:
        payload.role === "OWNER" ||
        payload.role === "ADMIN" ||
        payload.role === "MEMBER"
          ? payload.role
          : undefined,
    };
  } catch {
    return {};
  }
}

async function persistOrgCookie(orgId?: string): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    if (!orgId) {
      store.delete(ORG_COOKIE);
      return;
    }
    store.set(ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // jwt callback can run outside a mutable cookie context (middleware).
  }
}
