import { auth } from "@/auth";

// Next.js 16 "proxy" convention (formerly `middleware`). Wrapping the request in
// `auth` exposes `req.auth` (the current session) so we can optimistically gate
// protected routes before they render. Real authorization still lives in the
// pages/data layer (see `app/dashboard/page.tsx`).
export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
