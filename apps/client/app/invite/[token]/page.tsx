"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";

import { orgsApi } from "@/lib/scheduling";

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session.status === "unauthenticated") {
    router.replace(`/login?callbackUrl=/invite/${token}`);
    return null;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not accept invite</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            className="w-full"
            disabled={pending || session.status !== "authenticated"}
            onClick={async () => {
              setPending(true);
              try {
                await orgsApi.acceptInvite(token);
                router.push("/dashboard");
                router.refresh();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Invite is invalid or expired");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Joining…" : "Accept invitation"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
