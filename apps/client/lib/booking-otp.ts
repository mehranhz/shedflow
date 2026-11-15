"use server";

import { ApiError, apiFetch } from "@/lib/api";
import { readAuthSession } from "@/lib/api-envelope";

const ALREADY_SENT = /already sent/i;

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.length > 0) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

export async function requestBookingOtp(phone: string): Promise<
  { ok: true } | { ok: false; message: string; alreadySent: boolean }
> {
  const username = phone.trim();
  if (!username) {
    return { ok: false, message: "Phone is required.", alreadySent: false };
  }

  try {
    const body = await apiFetch<{ success?: boolean; message?: string }>(
      "/auth/request-otp",
      {
        method: "POST",
        headers: { Accept: "application/json" },
        body: JSON.stringify({ username }),
      },
    );
    if (body && body.success === false) {
      const message = body.message || "Could not send a verification code.";
      return { ok: false, message, alreadySent: ALREADY_SENT.test(message) };
    }
    return { ok: true };
  } catch (error) {
    const message = failureMessage(error, "Could not send a verification code.");
    return { ok: false, message, alreadySent: ALREADY_SENT.test(message) };
  }
}

export async function verifyBookingOtp(
  phone: string,
  code: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; phone: string }
  | { ok: false; message: string }
> {
  const username = phone.trim();
  const otp = code.trim();
  if (!username || !otp) {
    return { ok: false, message: "Enter the verification code." };
  }

  try {
    const session = readAuthSession(
      await apiFetch<unknown>("/auth/verify-otp", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: JSON.stringify({ username, code: otp }),
      }),
    );
    if (!session) {
      return { ok: false, message: "Could not verify that code." };
    }

    const { accessToken, refreshToken, user } = session;
    if (!accessToken || !refreshToken || !user?.id) {
      return { ok: false, message: "Could not verify that code." };
    }

    return {
      ok: true,
      accessToken,
      refreshToken,
      phone: user.phone ?? username,
    };
  } catch (error) {
    return { ok: false, message: failureMessage(error, "Could not verify that code.") };
  }
}
