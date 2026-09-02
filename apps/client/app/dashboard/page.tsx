import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { apiFetch, ApiError } from "@/lib/api";
import { SignOutButton } from "@/components/sign-out-button";

type Profile = { id: string; email: string; createdAt: string };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  // Demonstrates an authenticated call: the API JWT lives in the session and is
  // forwarded as a Bearer token to the NestJS `/auth/me` endpoint.
  let profile: Profile | null = null;
  let profileError: string | null = null;
  try {
    profile = await apiFetch<Profile>("/auth/me", {
      accessToken: session.accessToken,
    });
  } catch (error) {
    profileError =
      error instanceof ApiError
        ? `Could not load profile (${error.status}).`
        : "Could not reach the API.";
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-lg rounded-2xl border border-black/[.06] bg-white p-8 shadow-sm dark:border-white/[.08] dark:bg-[#0a0a0a]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <SignOutButton />
        </div>

        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          You are signed in as{" "}
          <span className="font-medium text-foreground">
            {session.user?.email}
          </span>
          .
        </p>

        <div className="rounded-lg border border-black/[.06] bg-zinc-50 p-4 text-sm dark:border-white/[.08] dark:bg-black">
          <h2 className="mb-3 font-medium">Profile from the API</h2>
          {profile ? (
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-zinc-600 dark:text-zinc-400">
              <dt className="font-medium text-foreground">ID</dt>
              <dd className="truncate">{profile.id}</dd>
              <dt className="font-medium text-foreground">Email</dt>
              <dd>{profile.email}</dd>
              <dt className="font-medium text-foreground">Joined</dt>
              <dd>{new Date(profile.createdAt).toLocaleString()}</dd>
            </dl>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">{profileError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
