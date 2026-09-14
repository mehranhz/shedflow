"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@shedflow/ui/components";
import {
  CalendarDays,
  CalendarRange,
  ChevronsUpDown,
  Code2,
  CreditCard,
  Home,
  Link2,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { canManageWorkspace, useOrg } from "@/components/org-provider";
import { orgsApi } from "@/lib/scheduling";

const MAIN_LINKS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/event-types", label: "Event types", icon: Link2 },
  { href: "/dashboard/bookings", label: "Meetings", icon: CalendarDays },
  { href: "/dashboard/availability", label: "Availability", icon: CalendarRange },
  { href: "/dashboard/customers", label: "Contacts", icon: Users },
];

const ADMIN_LINKS = [
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/developer", label: "Developer", icon: Code2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { update } = useSession();
  const { organization, organizations, profile, role } = useOrg();
  const admin = canManageWorkspace(role);
  const initials = (profile.email[0] ?? "S").toUpperCase();

  const switchOrg = async (orgId: string) => {
    if (orgId === organization.id) {
      return;
    }
    try {
      const result = await orgsApi.switchOrg(orgId);
      await update({ accessToken: result.accessToken });
      router.refresh();
      toast.success("Workspace switched");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch workspace");
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-4">
        <Link href="/dashboard" className="px-1">
          <Logo className="text-[15px]" />
        </Link>
        <SidebarMenu className="mt-3">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
                      {organization.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{organization.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {role.toLowerCase()} · {organization.platformPlan.toLowerCase()}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="start">
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                {organizations.map((item) => (
                  <DropdownMenuItem key={item.id} onClick={() => void switchOrg(item.id)}>
                    {item.name}
                    {item.id === organization.id ? (
                      <span className="ml-auto text-xs text-muted-foreground">Current</span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_LINKS.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      link.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(link.href)
                    }
                    tooltip={link.label}
                  >
                    <Link href={link.href}>
                      <link.icon />
                      <span>{link.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {admin ? (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ADMIN_LINKS.map((link) => (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(link.href)}
                        tooltip={link.label}
                      >
                        <Link href={link.href}>
                          <link.icon />
                          <span>{link.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-full">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{profile.email}</span>
                    <span className="truncate text-xs text-muted-foreground">Account</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>{profile.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void import("next-auth/react").then(({ signOut }) =>
                      signOut({ redirectTo: "/login" }),
                    );
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
