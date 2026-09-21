import { readError } from "@/lib/http";

type PublicOptions = RequestInit & { idempotencyKey?: string };

/**
 * Browser calls for `/v1/public/*` go through the same-origin BFF so LAN IP
 * origins never fetch `localhost:3001` (blocked by Private Network Access).
 *
 * Uses the existing `/api/bff/api/*` proxy with an unauthenticated allowlist
 * for paths under `public/`.
 */
export async function publicApi<T>(
  path: string,
  options: PublicOptions = {},
): Promise<T> {
  const { idempotencyKey, headers, ...rest } = options;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  // `/v1/public/orgs/...` → `/api/bff/api/public/orgs/...` → Nest `/v1/public/orgs/...`
  const afterV1 = normalized.replace(/^\/v1(?=\/|$)/, "") || "/";
  const response = await fetch(`/api/bff/api${afterV1}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return (await response.json()) as T;
}
