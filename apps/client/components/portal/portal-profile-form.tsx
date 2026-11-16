"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shedflow/ui/components";

import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { ClientApiError } from "@/lib/http";
import {
  fetchCustomerMe,
  updateCustomerProfile,
  type CustomerMe,
} from "@/lib/portal/customer-api";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

function readFieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ClientApiError) || !error.details || typeof error.details !== "object") {
    return {};
  }
  const fieldErrors = (error.details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object" || Array.isArray(fieldErrors)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (Array.isArray(value)) {
      result[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return result;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  const text = messages?.[0];
  if (!text) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-destructive">
      {text}
    </p>
  );
}

export function PortalProfileForm() {
  const t = useTranslations("portal.account.profile");
  const { activeBusiness } = usePortalBusiness();
  const organizationId = activeBusiness?.organizationId;

  const [loaded, setLoaded] = useState<CustomerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [locale, setLocale] = useState("en");
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setLoadError(null);
      try {
        const me = await fetchCustomerMe(organizationId);
        if (cancelled) {
          return;
        }
        applyProfile(me);
      } catch (error) {
        if (!cancelled) {
          setLoadError(messageOf(error, t("loadError")));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, t]);

  function applyProfile(me: CustomerMe): void {
    setLoaded(me);
    setName(me.user.name ?? "");
    setPhone(me.user.phone ?? "");
    setPhotoUrl(me.user.photoUrl ?? "");
    setTimezone(me.user.timezone || "UTC");
    setLocale(me.user.locale === "fa" ? "fa" : "en");
    setBusinessName(me.businessProfile?.name ?? "");
    setBusinessPhone(me.businessProfile?.phone ?? "");
    setFieldErrors({});
  }

  const timezoneOptions = timezone && !TIMEZONES.includes(timezone as (typeof TIMEZONES)[number])
    ? [timezone, ...TIMEZONES]
    : [...TIMEZONES];

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!loaded?.user.updatedAt) {
      setFormError(t("loadError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    const business = loaded.businessProfile;
    const businessDirty =
      business != null &&
      (businessName !== business.name || businessPhone !== (business.phone ?? ""));

    try {
      const saved = await updateCustomerProfile(
        {
          name,
          phone: phone.trim() ? phone : null,
          photoUrl: photoUrl.trim() ? photoUrl : null,
          timezone,
          locale,
          updatedAt: loaded.user.updatedAt,
          ...(businessDirty && business
            ? {
                business: {
                  name: businessName,
                  phone: businessPhone.trim() ? businessPhone : null,
                  updatedAt: business.updatedAt,
                },
              }
            : {}),
        },
        organizationId,
      );
      applyProfile(saved);
      setNotice(t("saved"));
    } catch (error) {
      const errors = readFieldErrors(error);
      setFieldErrors(errors);
      setFormError(
        error instanceof ClientApiError && error.status === 409
          ? t("conflict")
          : messageOf(error, t("saveError")),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !loaded) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (loadError && !loaded) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("loadError")}</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  const businessLabel = loaded?.businessProfile?.organizationName;

  return (
    <div className="space-y-6">
      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("saveError")}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={(event) => void onSave(event)} className="space-y-4 rounded-lg border p-4">
        <div className="grid gap-2">
          <Label htmlFor="profile-name">{t("name")}</Label>
          <Input
            id="profile-name"
            name="name"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "profile-name-error" : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError id="profile-name-error" messages={fieldErrors.name} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="profile-phone">{t("phone")}</Label>
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+14155552671"
            value={phone}
            aria-invalid={fieldErrors.phone ? true : undefined}
            aria-describedby={
              fieldErrors.phone ? "profile-phone-hint profile-phone-error" : "profile-phone-hint"
            }
            onChange={(event) => setPhone(event.target.value)}
          />
          <p id="profile-phone-hint" className="text-sm text-muted-foreground">
            {t("phoneHint")}
          </p>
          <FieldError id="profile-phone-error" messages={fieldErrors.phone} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="profile-photo">{t("photoUrl")}</Label>
          <Input
            id="profile-photo"
            name="photoUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={photoUrl}
            aria-invalid={fieldErrors.photoUrl ? true : undefined}
            aria-describedby="profile-photo-hint"
            onChange={(event) => setPhotoUrl(event.target.value)}
          />
          <p id="profile-photo-hint" className="text-sm text-muted-foreground">
            {t("photoHint")}
          </p>
          <FieldError id="profile-photo-error" messages={fieldErrors.photoUrl} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="profile-timezone">{t("timezone")}</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="profile-timezone" className="w-full min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="profile-timezone-error" messages={fieldErrors.timezone} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="profile-language">{t("language")}</Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger id="profile-language" className="w-full min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("languageEn")}</SelectItem>
              <SelectItem value="fa">{t("languageFa")}</SelectItem>
            </SelectContent>
          </Select>
          <FieldError id="profile-language-error" messages={fieldErrors.locale} />
        </div>

        {businessLabel ? (
          <fieldset className="space-y-4 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              {t("businessTitle", { business: businessLabel })}
            </legend>
            <p className="text-sm text-muted-foreground">{t("businessHint")}</p>
            <div className="grid gap-2">
              <Label htmlFor="profile-business-name">{t("businessName")}</Label>
              <Input
                id="profile-business-name"
                name="businessName"
                maxLength={120}
                value={businessName}
                aria-invalid={fieldErrors["business.name"] ? true : undefined}
                onChange={(event) => setBusinessName(event.target.value)}
              />
              <FieldError id="profile-business-name-error" messages={fieldErrors["business.name"]} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-business-phone">{t("businessPhone")}</Label>
              <Input
                id="profile-business-phone"
                name="businessPhone"
                type="tel"
                inputMode="tel"
                value={businessPhone}
                aria-invalid={fieldErrors["business.phone"] ? true : undefined}
                onChange={(event) => setBusinessPhone(event.target.value)}
              />
              <FieldError
                id="profile-business-phone-error"
                messages={fieldErrors["business.phone"]}
              />
            </div>
          </fieldset>
        ) : null}

        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={saving || !loaded}>
          {saving ? t("saving") : t("save")}
        </Button>
      </form>
    </div>
  );
}
