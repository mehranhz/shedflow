import { NextResponse } from "next/server";

import { apiFetch, ApiError } from "@/lib/api";

type ForgotBody = { email?: unknown };

export async function POST(request: Request) {
  let body: ForgotBody;
  try {
    body = (await request.json()) as ForgotBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { email } = body;
  if (typeof email !== "string") {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  try {
    await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
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
