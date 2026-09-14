"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
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

import { PageHeader } from "@/components/page-header";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { useOrg } from "@/components/org-provider";
import { orgsApi } from "@/lib/scheduling";

export default function SettingsPage() {
  const router = useRouter();
  const { organization, role } = useOrg();
  const owner = role === "OWNER";
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [currency, setCurrency] = useState(organization.currency);
  const [brandColor, setBrandColor] = useState(organization.brandColor ?? "#0069ff");
  const [logoUrl, setLogoUrl] = useState(organization.logoUrl ?? "");
  const [pending, setPending] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace profile, branding, and cancellation defaults."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!owner) {
                toast.error("Only the owner can update workspace settings");
                return;
              }
              setPending(true);
              try {
                await orgsApi.update(organization.id, {
                  name,
                  slug,
                  timezone,
                  currency,
                  brandColor,
                  logoUrl: logoUrl || null,
                });
                toast.success("Settings saved");
                router.refresh();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not save");
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" value={name} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Booking page slug</Label>
              <Input id="slug" value={slug} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSlug(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                Public URL: /{slug}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Time zone</Label>
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                maxLength={3}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCurrency(event.target.value.toUpperCase())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                value={logoUrl}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLogoUrl(event.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand">Brand color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="brand"
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-md border"
                  value={brandColor}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBrandColor(event.target.value)}
                />
                <Input value={brandColor} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBrandColor(event.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={pending || !owner}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {owner ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Soft-delete this workspace. Existing bookings are kept as history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!window.confirm("Delete this workspace?")) {
                  return;
                }
                try {
                  const { apiBff } = await import("@/lib/bff");
                  await apiBff(`organizations/${organization.id}`, { method: "DELETE" });
                  toast.success("Workspace deleted");
                  router.push("/dashboard");
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not delete");
                }
              }}
            >
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
