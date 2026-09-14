"use client";

import { ClientApiError, readError } from "@/lib/http";

type BffOptions = RequestInit & {
  idempotencyKey?: string;
  orgId?: string;
};

async function bffFetch<T>(
  prefix: "api" | "billing",
  path: string,
  options: BffOptions = {},
): Promise<T> {
  const { idempotencyKey, orgId, headers, ...rest } = options;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const response = await fetch(`/api/bff/${prefix}/${normalized}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(orgId ? { "X-Organization-Id": orgId } : {}),
      ...headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return (await response.json()) as T;
}

export function apiBff<T>(path: string, options?: BffOptions): Promise<T> {
  return bffFetch<T>("api", path, options);
}

export function billingBff<T>(path: string, options?: BffOptions): Promise<T> {
  return bffFetch<T>("billing", path, options);
}

export { ClientApiError };
