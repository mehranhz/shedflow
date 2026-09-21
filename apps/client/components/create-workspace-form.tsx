"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { apiBff } from "@/lib/bff";
import { guessTimeZone } from "@/lib/timezones";
import type { Organization } from "@/lib/types";
import { randomUUID } from "@/lib/uuid";

export function CreateWorkspaceForm({ email }: { email: string }) {
  const router = useRouter();
  const { update } = useSession();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(guessTimeZone());
  const [pending, setPending] = useState(false);

  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader>
        <Logo className="mb-4" />
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>
          Signed in as {email}. Name the business your invitees will see.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            try {
              const org = await apiBff<Organization>("organizations", {
                method: "POST",
                body: JSON.stringify({ name, timezone }),
                idempotencyKey: randomUUID(),
              });
              const switched = await apiBff<{ accessToken: string }>(
                `organizations/${org.id}/switch`,
                { method: "POST" },
              );
              await update({ accessToken: switched.accessToken });
              router.push("/dashboard/onboarding");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not create workspace");
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="workspace">Workspace name</Label>
            <Input
              id="workspace"
              required
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setName(event.target.value)}
              placeholder="Acme Coaching"
            />
          </div>
          <div className="grid gap-2">
            <Label>Time zone</Label>
            <TimezoneCombobox value={timezone} onChange={setTimezone} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
