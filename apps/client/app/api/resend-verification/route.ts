import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { apiFetch, ApiError } from "@/lib/api";

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  try {
    await apiFetch("/auth/resend-verification", {
      method: "POST",
      accessToken: session.accessToken,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { message: "Unable to reach the authentication service" },
      { status: 502 },
    );
  }
}
