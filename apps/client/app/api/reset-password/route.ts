import { NextResponse } from "next/server";

import { apiFetch, ApiError } from "@/lib/api";

type ResetBody = { token?: unknown; password?: unknown };

export async function POST(request: Request) {
  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { token, password } = body;
  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { message: "Token and password are required" },
      { status: 400 },
    );
  }

  try {
    await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
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
