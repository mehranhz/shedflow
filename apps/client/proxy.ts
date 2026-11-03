import { auth } from "@/auth";
import {
  isProtectedPortalPath,
  isPublicPortalPath,
} from "@/lib/portal/constants";
import { readAccessTokenClaims } from "@/lib/portal/jwt-claims";

// Next.js 16 "proxy" convention (formerly `middleware`). Wrapping the request in
// `auth` exposes `req.auth` (the current session) so we can optimistically gate
// protected routes before they render. Real authorization still lives in the
// pages/data layer (see `app/dashboard/page.tsx`).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/portal")) {
    if (isProtectedPortalPath(pathname) && !req.auth?.accessToken) {
      const login = new URL("/portal/login", req.nextUrl.origin);
      login.searchParams.set("next", pathname);
      return Response.redirect(login);
    }

    if (req.auth?.accessToken && pathname === "/portal/choose") {
      return undefined;
    }

    if (
      req.auth?.accessToken &&
      isPublicPortalPath(pathname) &&
      pathname !== "/portal" &&
      !pathname.startsWith("/portal/login") &&
      !pathname.startsWith("/portal/register") &&
      !pathname.startsWith("/portal/claim")
    ) {
      return undefined;
    }

    if (req.auth?.accessToken && pathname.startsWith("/portal")) {
      const claims = readAccessTokenClaims(req.auth.accessToken);
      const isStaff = Boolean(claims.role && claims.orgId);
      const isCustomer =
        claims.actorType === "CUSTOMER" || Boolean(claims.customerOrgId);

      if (isStaff && !isCustomer && isProtectedPortalPath(pathname)) {
        const staff = new URL("/portal/staff", req.nextUrl.origin);
        staff.searchParams.set("next", pathname);
        return Response.redirect(staff);
      }
    }

    return undefined;
  }

  if (!req.auth) {
    const signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/invite/:path*",
    "/my-bookings",
    "/client",
    "/portal",
    "/portal/:path*",
  ],
};
