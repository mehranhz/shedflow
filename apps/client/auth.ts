import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import type { JWT } from "next-auth/jwt";

import { readAuthSession } from "@/lib/api-envelope";
import { API_URL } from "@/lib/config";
import { persistCustomerOrgCookie } from "@/lib/portal/customer-cookies";
import { readAccessTokenClaims } from "@/lib/portal/jwt-claims";
import { refreshSessionTokens } from "@/lib/refresh-session";

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
        phone: { label: "Phone", type: "text" },
        password: { label: "Password", type: "password" },
        accessToken: { label: "Access token", type: "text" },
        refreshToken: { label: "Refresh token", type: "text" },
      },
      authorize: async (credentials) => {
        const accessToken = credentials?.accessToken;
        const refreshToken = credentials?.refreshToken;
        if (
          typeof accessToken === "string" &&
          accessToken.length > 0 &&
          typeof refreshToken === "string" &&
          refreshToken.length > 0
        ) {
          const claims = readAccessTokenClaims(accessToken);
          if (!claims.id) {
            return null;
          }
          const phone =
            claims.phone ??
            (typeof credentials?.phone === "string" ? credentials.phone : undefined);
          return {
            id: claims.id,
            phone,
            accessToken,
            refreshToken,
          };
        }

        const phone = credentials?.phone;
        const password = credentials?.password;
        if (typeof phone !== "string" || typeof password !== "string") {
          return null;
        }

        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: phone, password }),
        });

        if (!response.ok) {
          return null;
        }

        const session = readAuthSession(await response.json());
        if (!session) {
          return null;
        }
        return {
          id: session.user.id,
          phone: session.user.phone ?? phone,
          email: session.user.email,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        };
      },
    }),
    Credentials({
      id: "customer-portal",
      name: "Customer portal",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        accessToken: { label: "Access token", type: "text" },
        refreshToken: { label: "Refresh token", type: "text" },
      },
      authorize: async (credentials) => {
        const accessToken = credentials?.accessToken;
        const refreshToken = credentials?.refreshToken;
        if (
          typeof accessToken === "string" &&
          accessToken.length > 0 &&
          typeof refreshToken === "string" &&
          refreshToken.length > 0
        ) {
          const claims = readAccessTokenClaims(accessToken);
          if (!claims.id) {
            return null;
          }
          return {
            id: claims.id,
            email: typeof credentials?.email === "string" ? credentials.email : undefined,
            accessToken,
            refreshToken,
          };
        }

        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        try {
          const response = await fetch(`${API_URL}/v1/customer/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
          });
          if (!response.ok) {
            return null;
          }
          const session = readAuthSession(await response.json());
          if (!session) {
            return null;
          }
          return {
            id: session.user.id,
            email: session.user.email ?? email,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (trigger === "update" && session && typeof session === "object") {
        const next = session as { accessToken?: string };
        if (typeof next.accessToken === "string") {
          applyAccessToken(token, next.accessToken, token.refreshToken);
          await persistOrgCookie(token.orgId);
          await persistCustomerOrgCookie(token.customerOrgId);
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        if (user.phone) {
          token.phone = user.phone;
        }
        if (user.email) {
          token.email = user.email;
        }
        applyAccessToken(token, user.accessToken, user.refreshToken);

        await persistOrgCookie(token.orgId);
        await persistCustomerOrgCookie(token.customerOrgId);
        delete token.error;
        return {
          ...token,
          accessToken: user.accessToken,
        };
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
          orgId: undefined,
          role: undefined,
          impersonatingOrgId: undefined,
          actorType: undefined,
          customerOrgId: undefined,
          customerId: undefined,
          error: "RefreshTokenError",
        };
      }

      try {
        const refreshScope =
          token.actorType === "CUSTOMER" ? token.customerOrgId : token.orgId;
        const rotated = await refreshSessionTokens(
          API_URL,
          token.refreshToken,
          refreshScope,
        );
        applyAccessToken(token, rotated.accessToken, rotated.refreshToken);
        await persistOrgCookie(token.orgId);
        await persistCustomerOrgCookie(token.customerOrgId);
        token.error = undefined;
        return token;
      } catch {
        return {
          ...token,
          refreshToken: undefined,
          accessTokenExpires: undefined,
          orgId: undefined,
          role: undefined,
          impersonatingOrgId: undefined,
          actorType: undefined,
          customerOrgId: undefined,
          customerId: undefined,
          error: "RefreshTokenError",
        };
      }
    },
    session: async ({ session, token }) => {
      if (token.id) {
        session.user.id = token.id;
      }
      if (token.phone) {
        session.user.phone = token.phone;
      }
      if (token.email) {
        session.user.email = token.email;
      }
      if (token.accessToken) {
        session.accessToken = token.accessToken;
      }
      session.orgId = token.orgId;
      session.role = token.role;
      session.impersonatingOrgId = token.impersonatingOrgId;
      session.actorType = token.actorType;
      session.customerOrgId = token.customerOrgId;
      session.customerId = token.customerId;
      return session;
    },
  },
});

function applyAccessToken(
  token: JWT,
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
    token.impersonatingOrgId = undefined;
    token.actorType = undefined;
    token.customerOrgId = undefined;
    token.customerId = undefined;
    return;
  }

  const claims = readAccessTokenClaims(accessToken);
  token.accessToken = accessToken;
  token.accessTokenExpires = claims.expires;
  token.orgId = claims.orgId;
  token.role = claims.role;
  token.impersonatingOrgId = claims.impersonatingOrgId;
  token.actorType = claims.actorType;
  token.customerOrgId = claims.customerOrgId;
  token.customerId = claims.customerId;
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
