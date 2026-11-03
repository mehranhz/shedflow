import { NextResponse } from "next/server";

import { apiFetch, ApiError } from "@/lib/api";

type RegisterBody = {
  phone?: unknown;
  username?: unknown;
  password?: unknown;
  name?: unknown;
  organizationName?: unknown;
  timezone?: unknown;
};

type RegisterEnvelope = {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
    user: unknown;
  };
};

function readPhone(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const phone = value.trim();
  return phone.length > 0 ? phone : undefined;
}

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const phone = readPhone(body.phone) ?? readPhone(body.username);
  const { password, name, organizationName, timezone } = body;
  if (!phone || typeof password !== "string" || typeof name !== "string") {
    return NextResponse.json(
      { message: "Phone, name, and password are required" },
      { status: 400 },
    );
  }

  const payload: {
    username: string;
    name: string;
    password: string;
    organizationName?: string;
    timezone?: string;
  } = {
    username: phone,
    name,
    password,
  };
  if (typeof organizationName === "string") {
    payload.organizationName = organizationName;
  }
  if (typeof timezone === "string") {
    payload.timezone = timezone;
  }

  try {
    const envelope = await apiFetch<RegisterEnvelope>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return NextResponse.json(envelope, { status: 201 });
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
