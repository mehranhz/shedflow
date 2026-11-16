import { auth } from "@/auth";
import { API_URL, BILLING_URL } from "@/lib/config";
import { readCustomerOrgCookie } from "@/lib/portal/customer-cookies";

async function forward(
  request: Request,
  target: string,
  headers: Headers,
): Promise<Response> {
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const outbound = new Headers();
  const pass = ["content-type", "x-request-id", "etag"];
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

function copyForwardHeaders(request: Request, headers: Headers): void {
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const idempotency = request.headers.get("idempotency-key");
  if (idempotency) {
    headers.set("Idempotency-Key", idempotency);
  }
  const ifMatch = request.headers.get("if-match");
  if (ifMatch) {
    headers.set("If-Match", ifMatch);
  }
  const requestId = request.headers.get("x-request-id");
  if (requestId) {
    headers.set("X-Request-Id", requestId);
  }
}

function isPublicApiPath(path: string[]): boolean {
  if (path[0] === "public") {
    return true;
  }
  if (path[0] === "customer" && path[1] === "auth") {
    return true;
  }
  if (path[0] === "auth" && path[1] === "login") {
    return true;
  }
  return false;
}

async function proxy(
  request: Request,
  path: string[],
  baseUrl: string,
  prefix: string,
  options?: { allowPublicUnauthenticated?: boolean },
): Promise<Response> {
  const isPublic =
    options?.allowPublicUnauthenticated === true && isPublicApiPath(path);

  if (
    isPublic &&
    (path.length < 1 ||
      path.some((segment) => segment === ".." || segment.includes("\\")))
  ) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Invalid path" } },
      { status: 400 },
    );
  }

  const headers = new Headers();
  if (!isPublic) {
    const session = await auth();
    if (!session?.accessToken) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
        { status: 401 },
      );
    }
    headers.set("Authorization", `Bearer ${session.accessToken}`);

    const isCustomerRoute = path[0] === "customer";
    if (isCustomerRoute) {
      const customerOrg =
        request.headers.get("x-customer-org-id") ??
        (await readCustomerOrgCookie()) ??
        session.customerOrgId;
      if (customerOrg) {
        headers.set("X-Customer-Org-Id", customerOrg);
      }
    } else {
      const orgId = request.headers.get("x-organization-id") ?? session.orgId;
      if (orgId) {
        headers.set("X-Organization-Id", orgId);
      }
    }
  }

  const incoming = new URL(request.url);
  const target = `${baseUrl}${prefix}/${path.join("/")}${incoming.search}`;
  copyForwardHeaders(request, headers);
  return forward(request, target, headers);
}

export async function proxyApi(
  request: Request,
  path: string[],
): Promise<Response> {
  return proxy(request, path, API_URL, "/v1", { allowPublicUnauthenticated: true });
}

export async function proxyBilling(
  request: Request,
  path: string[],
): Promise<Response> {
  // Billing Nest controllers live under `/v1/billing/...` (see design `05`).
  return proxy(request, path, BILLING_URL, "/v1/billing");
}

/**
 * Unauthenticated proxy for `/v1/public/*` so the browser talks same-origin
 * (works over LAN IP; avoids Private Network Access blocks to localhost).
 */
export async function proxyPublic(
  request: Request,
  path: string[],
): Promise<Response> {
  return proxy(request, ["public", ...path], API_URL, "/v1", {
    allowPublicUnauthenticated: true,
  });
}

