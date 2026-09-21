"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { useOrg } from "@/components/org-provider";
import { orgsApi } from "@/lib/scheduling";
import { previewStore } from "@/lib/preview-store";

function normalizeBrandColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export default function SettingsPage() {
  const t = useTranslations("dashboard.settings");
  const tc = useTranslations("dashboard.common");
  const router = useRouter();
  const { organization, role, profile } = useOrg();
  const owner = role === "OWNER";
  const canEdit = role === "OWNER" || role === "ADMIN";
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [locale, setLocale] = useState(organization.locale || "en-US");
  const [currency, setCurrency] = useState(organization.currency);
  const [brandColor, setBrandColor] = useState(organization.brandColor ?? "#0069ff");
  const [logoUrl, setLogoUrl] = useState(organization.logoUrl ?? "");
  const [hideBadge, setHideBadge] = useState(
    Boolean(
      (organization.settings as { branding?: { hideSchedflowBadge?: boolean } })
        ?.branding?.hideSchedflowBadge,
    ),
  );
  const [pending, setPending] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile")}</CardTitle>
          <CardDescription>{t("profileBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canEdit) {
                toast.error(t("adminOnly"));
                return;
              }
              if (!owner && slug !== organization.slug) {
                toast.error(t("ownerSlug"));
                return;
              }
              const color = normalizeBrandColor(brandColor);
              if (!/^#[0-9a-f]{6}$/.test(color)) {
                toast.error(t("colorFormat"));
                return;
              }
              setPending(true);
              try {
                const body: Record<string, unknown> = {
                  name,
                  timezone,
                  locale,
                  currency,
                  brandColor: color,
                  logoUrl: logoUrl || null,
                  settings: {
                    ...organization.settings,
                    branding: {
                      ...((organization.settings as { branding?: object }).branding ?? {}),
                      hideSchedflowBadge: hideBadge,
                    },
                  },
                };
                if (owner) {
                  body.slug = slug;
                }
                const updated = await orgsApi.update(organization.id, body);
                try {
                  previewStore.ensure(updated, profile.id);
                } catch {
                  // ignore preview sync failures
                }
                toast.success(t("saved"));
                router.refresh();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("saveFailed"));
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="name">{t("workspaceName")}</Label>
              <Input
                id="name"
                value={name}
                disabled={!canEdit}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setName(event.target.value)
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">{t("slug")}</Label>
              <Input
                id="slug"
                value={slug}
                disabled={!owner}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSlug(event.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("publicUrl", { slug })}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t("timezone")}</Label>
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="locale">{t("locale")}</Label>
                <Input
                  id="locale"
                  value={locale}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setLocale(event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">{t("currency")}</Label>
                <Input
                  id="currency"
                  value={currency}
                  maxLength={3}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="logo">{t("logoUrl")}</Label>
              <Input
                id="logo"
                value={logoUrl}
                disabled={!canEdit}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setLogoUrl(event.target.value)
                }
                placeholder="https://"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brand">{t("brandColor")}</Label>
              <div className="flex items-center gap-3">
                <input
                  id="brand"
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-md border"
                  value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#0069ff"}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setBrandColor(event.target.value)
                  }
                />
                <Input
                  value={brandColor}
                  disabled={!canEdit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setBrandColor(event.target.value)
                  }
                />
              </div>
            </div>
            {organization.platformPlan === "PRO" ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t("hideBadge")}</p>
                  <p className="text-xs text-muted-foreground">{t("hideBadgeHint")}</p>
                </div>
                <Switch
                  checked={hideBadge}
                  disabled={!canEdit}
                  onCheckedChange={setHideBadge}
                />
              </div>
            ) : null}
            <Button type="submit" disabled={pending || !canEdit}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {owner ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">{t("dangerTitle")}</CardTitle>
            <CardDescription>{t("dangerBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!window.confirm(t("deleteConfirm"))) {
                  return;
                }
                try {
                  const { apiBff } = await import("@/lib/bff");
                  await apiBff(`organizations/${organization.id}`, { method: "DELETE" });
                  toast.success(t("deleted"));
                  router.push("/dashboard");
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("deleteFailed"));
                }
              }}
            >
              {t("deleteWorkspace")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
