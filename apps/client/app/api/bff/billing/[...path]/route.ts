import { proxyBilling } from "@/lib/bff-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return proxyBilling(request, (await context.params).path);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyBilling(request, (await context.params).path);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyBilling(request, (await context.params).path);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyBilling(request, (await context.params).path);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyBilling(request, (await context.params).path);
}
