export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export function extractError(body: unknown, fallback: string): {
  message: string;
  code?: string;
  details?: unknown;
} {
  if (!body || typeof body !== "object") {
    return { message: fallback };
  }
  const record = body as {
    message?: unknown;
    error?: { message?: unknown; code?: unknown; details?: unknown };
  };
  const nested = record.error?.message;
  const code =
    typeof record.error?.code === "string" ? record.error.code : undefined;
  if (typeof nested === "string" && nested.length > 0) {
    return { message: nested, code, details: record.error?.details };
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return { message: record.message, code };
  }
  if (Array.isArray(record.message)) {
    return {
      message: record.message.filter((item) => typeof item === "string").join(", "),
      code,
    };
  }
  return { message: fallback, code };
}

export async function readError(response: Response): Promise<ClientApiError> {
  const body = (await response.json().catch(() => ({}))) as unknown;
  const parsed = extractError(body, "Request failed");
  return new ClientApiError(
    parsed.message,
    response.status,
    parsed.code,
    parsed.details,
  );
}

export function isMissingRoute(error: unknown): boolean {
  return error instanceof ClientApiError && error.status === 404;
}
