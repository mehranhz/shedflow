import { PUBLIC_API_URL } from "@/lib/public-config";
import { readError } from "@/lib/http";

type PublicOptions = RequestInit & { idempotencyKey?: string };

export async function publicApi<T>(
  path: string,
  options: PublicOptions = {},
): Promise<T> {
  const { idempotencyKey, headers, ...rest } = options;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${PUBLIC_API_URL}${normalized}`, {
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
