export type RotatedSessionTokens = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Exchanges a refresh token for a new access + refresh pair. Used by the
 * NextAuth `jwt` callback when the access JWT is within 60s of expiry.
 * Pass `organizationId` so rotation keeps the switched workspace claim.
 */
export async function refreshSessionTokens(
  apiUrl: string,
  refreshToken: string,
  organizationId?: string,
): Promise<RotatedSessionTokens> {
  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refreshToken,
      ...(organizationId ? { organizationId } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error("Refresh token rotation failed");
  }

  const body = (await response.json()) as Partial<RotatedSessionTokens>;
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("Refresh token rotation failed");
  }

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}
