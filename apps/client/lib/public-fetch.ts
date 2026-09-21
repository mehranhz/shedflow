import { PUBLIC_API_URL } from "@/lib/public-config";
import { ClientApiError, isMissingRoute } from "@/lib/http";

export type PublicFetchKind = "ok" | "not_found" | "unavailable";

export type PublicFetchResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "not_found" | "unavailable"; data: null };

function messageFromBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const record = body as {
    message?: unknown;
    error?: { message?: unknown };
  };
  if (typeof record.error?.message === "string") {
    return record.error.message;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  return "";
}

export function isPublicApiUnavailable(error: unknown): boolean {
  if (isMissingRoute(error)) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof ClientApiError && error.status >= 500) {
    return true;
  }
  if (
    error instanceof Error &&
    /failed to fetch|networkerror|load failed|fetch failed/i.test(error.message)
  ) {
    return true;
  }
  return false;
}

/** Server-safe public GET. Distinguishes domain 404 from API-down. */
export async function fetchPublicJson<T>(path: string): Promise<PublicFetchResult<T>> {
  try {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const response = await fetch(`${PUBLIC_API_URL}${normalized}`, {
      cache: "no-store",
    });
    if (response.ok) {
      return { kind: "ok", data: (await response.json()) as T };
    }
    const body = (await response.json().catch(() => ({}))) as unknown;
    const message = messageFromBody(body);
    if (response.status === 404 && /^Cannot (GET|POST|PUT|PATCH|DELETE)\b/i.test(message)) {
      return { kind: "unavailable", data: null };
    }
    if (response.status === 404) {
      return { kind: "not_found", data: null };
    }
    return { kind: "unavailable", data: null };
  } catch {
    return { kind: "unavailable", data: null };
  }
}
