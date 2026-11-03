"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@shedflow/ui/components";

/**
 * Privacy / DSR controls for the customer portal (T-077).
 * Wired to `/v1/customer/export` and `DELETE /v1/customer/account`.
 */
export function PortalPrivacyPanel() {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token =
    (session as { accessToken?: string } | null)?.accessToken ??
    (session as { access_token?: string } | null)?.access_token;

  async function exportData() {
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/bff/api/customer/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shedflow-customer-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your SchedFlow customer account? This cannot be undone. Businesses keep anonymized booking times.",
      )
    ) {
      return;
    }
    setBusy("delete");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/bff/api/customer/account", {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Idempotency-Key": crypto.randomUUID(),
        },
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Delete failed (${res.status})`);
      }
      setMessage("Account deleted. You will be signed out.");
      window.location.href = "/portal/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="privacy-heading">
      <div>
        <h1 id="privacy-heading" className="text-2xl font-semibold tracking-tight">
          Privacy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export or delete the personal data linked to your customer account.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert role="status">
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => void exportData()}
          disabled={busy !== null}
        >
          {busy === "export" ? "Exporting…" : "Export my data"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => void deleteAccount()}
          disabled={busy !== null}
        >
          {busy === "delete" ? "Deleting…" : "Delete account"}
        </Button>
      </div>
    </section>
  );
}
