"use client";

import { useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { useOrg } from "@/components/org-provider";
import { apiBff } from "@/lib/bff";

export function ImpersonationBanner() {
  const { profile, organization } = useOrg();
  const { update } = useSession();
  const [pending, startTransition] = useTransition();

  if (!profile.impersonatingOrgId) {
    return null;
  }

  return (
    <Alert className="mb-6 border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
      <AlertTitle>Impersonating workspace</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          You are viewing <strong>{organization.name}</strong> as a platform
          admin. Actions are audited.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              try {
                const result = await apiBff<{ accessToken: string }>(
                  "platform/impersonate/stop",
                  { method: "POST" },
                );
                await update({ accessToken: result.accessToken });
                window.location.href = "/dashboard";
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not leave impersonation",
                );
              }
            });
          }}
        >
          {pending ? "Leaving…" : "Exit impersonation"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
