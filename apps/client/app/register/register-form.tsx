"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
} from "@shedflow/ui/components";

import { guessTimeZone } from "@/lib/timezones";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          organizationName,
          timezone: guessTimeZone(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message ?? "Registration failed.");
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        router.push("/login");
        return;
      }

      router.push("/dashboard/onboarding");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Registration failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setName(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="organizationName">Workspace name</Label>
        <Input
          id="organizationName"
          name="organizationName"
          value={organizationName}
          placeholder="Acme Coaching"
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setOrganizationName(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEmail(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Sign up with email"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
