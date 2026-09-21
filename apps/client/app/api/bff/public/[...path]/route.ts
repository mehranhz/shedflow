import { proxyPublic } from "@/lib/bff-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return proxyPublic(request, (await context.params).path);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyPublic(request, (await context.params).path);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyPublic(request, (await context.params).path);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyPublic(request, (await context.params).path);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyPublic(request, (await context.params).path);
}
