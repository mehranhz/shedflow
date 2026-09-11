import { NextResponse } from "next/server";

import { apiFetch, ApiError } from "@/lib/api";

type VerifyBody = { token?: unknown };

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { token } = body;
  if (typeof token !== "string") {
    return NextResponse.json({ message: "Token is required" }, { status: 400 });
  }

  try {
    await apiFetch("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
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
