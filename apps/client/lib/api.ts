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

type ApiErrorBody = { message?: string | string[] };

function extractMessage(body: ApiErrorBody, fallback: string): string {
  if (Array.isArray(body.message)) {
    return body.message.join(", ");
  }
  return body.message ?? fallback;
}

/**
 * Calls the NestJS API from the server. Pass `accessToken` (from the Auth.js
 * session) to authenticate against JWT-guarded endpoints such as `/auth/me`.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
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
      extractMessage(body as ApiErrorBody, "Request failed"),
      response.status,
    );
  }

  return body as T;
}
