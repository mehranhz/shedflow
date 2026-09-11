import "server-only";

import { API_URL } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function resolveApiPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized.startsWith("/v1/") ||
    normalized === "/v1" ||
    normalized.startsWith("/auth/") ||
    normalized === "/auth" ||
    normalized.startsWith("/health") ||
    normalized.startsWith("/metrics")
  ) {
    return normalized;
  }
  return `/v1${normalized}`;
}

function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const record = body as {
    message?: unknown;
    error?: { message?: unknown };
  };

  const nested = record.error?.message;
  if (typeof nested === "string" && nested.length > 0) {
    return nested;
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  if (Array.isArray(record.message)) {
    return record.message.filter((item) => typeof item === "string").join(", ");
  }
  return fallback;
}

/**
 * Calls the NestJS API from the server. Pass `accessToken` (from the Auth.js
 * session) to authenticate against JWT-guarded endpoints such as `/auth/me`.
 * Product routes are prefixed with `/v1`; `/auth/*`, `/health`, and `/metrics`
 * stay unversioned.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${resolveApiPath(path)}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new ApiError(
      extractMessage(body, "Request failed"),
      response.status,
    );
  }

  return body as T;
}
