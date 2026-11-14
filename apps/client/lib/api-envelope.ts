/** Reads a Nest JSON body, or a `{ success, data }` envelope if one is present. */
export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === "object" && "success" in body) {
    const envelope = body as { success?: boolean; data?: T; message?: string };
    if (!envelope.success || envelope.data == null) {
      throw new Error(envelope.message || "Request failed");
    }
    return envelope.data;
  }
  return body as T;
}

export type AuthSessionBody = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    createdAt?: string;
  };
};

export function readAuthSession(body: unknown): AuthSessionBody | null {
  try {
    const data = unwrapData<Partial<AuthSessionBody>>(body);
    if (
      !data ||
      typeof data.accessToken !== "string" ||
      typeof data.refreshToken !== "string" ||
      !data.user?.id
    ) {
      return null;
    }
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    };
  } catch {
    return null;
  }
}
