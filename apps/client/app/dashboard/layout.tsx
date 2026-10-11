import { redirect } from "next/navigation";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Separator,
} from "@shedflow/ui/components";

import { auth } from "@/auth";
import { apiFetch } from "@/lib/api";
import type { APIResponse, AuthMembership, AuthProfile, Organization } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";
import { OrgProvider } from "@/components/org-provider";
import { SkipLink } from "@/components/skip-link";
import { VerificationBanner } from "@/components/verification-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  console.log(session);
  if (!session) {
    console.log("big error")
    // redirect("/login");
  }

  let profile: AuthProfile | null = null;
  try {
    profile = (await apiFetch<APIResponse<AuthProfile>>("/auth/me",{accessToken: session?.accessToken})).data!;
    console.log(profile)
  } catch (error){

    console.log(error)
    // redirect("/login");
  }

  if (profile?.activeOrganization == null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#f6f7f9] px-4">
        <CreateWorkspaceForm phone={profile!.phone} />
      </div>
    );
  }

  let organizations: AuthMembership[] = profile.memberships;
  try {
    organizations = profile.memberships;
  } catch {
    organizations = profile.memberships;
  }

  

  return (
    <OrgProvider profile={profile} organizations={organizations}>
      <SkipLink href="#main" />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-[#f6f7f9]">
          <header className="flex h-14 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm text-muted-foreground">
              {profile?.activeOrganization?.name}
              {profile?.impersonatingOrgId ? " · impersonating" : ""}
            </span>
          </header>
          <div id="main" className="flex-1 px-6 py-6 lg:px-8" tabIndex={-1}>
            <ImpersonationBanner />
            {!profile.phoneVerifiedAt ? (
              <div className="mb-6">
                <VerificationBanner />
              </div>
            ) : null}
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </OrgProvider>
  );
}
