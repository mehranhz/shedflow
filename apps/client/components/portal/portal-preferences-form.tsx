"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@shedflow/ui/components";

import { TimezoneCombobox } from "@/components/timezone-combobox";
import { isAppLocale, localeDirection, writeLocaleCookie } from "@/i18n/config";
import { ClientApiError } from "@/lib/http";
import {
  fetchCustomerMe,
  updateCustomerProfile,
  type CustomerMe,
} from "@/lib/portal/customer-api";

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

export function PortalPreferencesForm() {
  const t = useTranslations("portal.account.preferences");
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [loaded, setLoaded] = useState<CustomerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [timezone, setTimezone] = useState("UTC");
  const [locale, setLocale] = useState("en");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [denseText, setDenseText] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setLoadError(null);
      try {
        const me = await fetchCustomerMe();
        if (cancelled) {
          return;
        }
        applyPreferences(me);
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
  }, [t]);

  function applyPreferences(me: CustomerMe): void {
    setLoaded(me);
    setTimezone(me.user.portal?.timezone || me.user.timezone || "UTC");
    const nextLocale = me.user.portal?.locale || me.user.locale || "en";
    setLocale(nextLocale === "fa" ? "fa" : "en");
    setReduceMotion(me.user.portal?.reduceMotion === true);
    setDenseText(me.user.portal?.denseText === true);
    setFieldErrors({});
  }

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

    try {
      const saved = await updateCustomerProfile({
        timezone,
        locale,
        updatedAt: loaded.user.updatedAt,
        portal: {
          reduceMotion,
          denseText,
          highContrast: "system",
        },
      });
      applyPreferences(saved);
      if (isAppLocale(saved.user.locale)) {
        writeLocaleCookie(saved.user.locale);
        document.documentElement.lang = saved.user.locale;
        document.documentElement.dir = localeDirection(saved.user.locale);
      }
      const shell = document.querySelector(".portal-shell");
      if (shell instanceof HTMLElement) {
        shell.dataset.reduceMotion = saved.user.portal?.reduceMotion ? "reduce" : "off";
        shell.dataset.denseText = saved.user.portal?.denseText ? "true" : "false";
        shell.dataset.highContrast = "system";
      }
      setNotice(t("saved"));
      startTransition(() => {
        router.refresh();
      });
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
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (loadError && !loaded) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  return (
    <form onSubmit={(event) => void onSave(event)} className="space-y-6 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label id="prefs-timezone-label" htmlFor="prefs-timezone">
          {t("timezone")}
        </Label>
        <TimezoneCombobox
          id="prefs-timezone"
          labelledBy="prefs-timezone-label"
          value={timezone}
          onChange={setTimezone}
          className="min-h-11 w-full"
        />
        <FieldError id="prefs-timezone-error" messages={fieldErrors.timezone} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prefs-language">{t("language")}</Label>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger id="prefs-language" className="w-full min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t("languageEn")}</SelectItem>
            <SelectItem value="fa">{t("languageFa")}</SelectItem>
          </SelectContent>
        </Select>
        <FieldError id="prefs-language-error" messages={fieldErrors.locale} />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("accessibility")}</legend>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="prefs-reduce-motion">{t("reduceMotion")}</Label>
            <p id="prefs-reduce-motion-hint" className="text-sm text-muted-foreground">
              {t("reduceMotionHint")}
            </p>
          </div>
          <Switch
            id="prefs-reduce-motion"
            checked={reduceMotion}
            onCheckedChange={setReduceMotion}
            aria-describedby="prefs-reduce-motion-hint"
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="prefs-dense-text">{t("denseText")}</Label>
            <p id="prefs-dense-text-hint" className="text-sm text-muted-foreground">
              {t("denseTextHint")}
            </p>
          </div>
          <Switch
            id="prefs-dense-text"
            checked={denseText}
            onCheckedChange={setDenseText}
            aria-describedby="prefs-dense-text-hint"
          />
        </div>
        <div className="grid gap-1">
          <p className="text-sm font-medium">{t("highContrast")}</p>
          <p className="text-sm text-muted-foreground">{t("highContrastHint")}</p>
        </div>
      </fieldset>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={saving || !loaded}>
        {saving ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
