import { auth } from "@/auth";
import { API_URL, BILLING_URL } from "@/lib/config";

async function proxy(
  request: Request,
  path: string[],
  baseUrl: string,
  prefix: string,
): Promise<Response> {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${baseUrl}${prefix}/${path.join("/")}${incoming.search}`;
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const idempotency = request.headers.get("idempotency-key");
  if (idempotency) {
    headers.set("Idempotency-Key", idempotency);
  }
  const orgId = request.headers.get("x-organization-id") ?? session.orgId;
  if (orgId) {
    headers.set("X-Organization-Id", orgId);
  }
  const requestId = request.headers.get("x-request-id");
  if (requestId) {
    headers.set("X-Request-Id", requestId);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const outbound = new Headers();
  const pass = ["content-type", "x-request-id"];
  for (const name of pass) {
    const value = response.headers.get(name);
    if (value) {
      outbound.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: outbound,
  });
}

export async function proxyApi(
  request: Request,
  path: string[],
): Promise<Response> {
  return proxy(request, path, API_URL, "/v1");
}

export async function proxyBilling(
  request: Request,
  path: string[],
): Promise<Response> {
  return proxy(request, path, BILLING_URL, "/v1");
}
