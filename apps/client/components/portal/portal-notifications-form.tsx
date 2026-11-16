"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@shedflow/ui/components";

import { TimezoneCombobox } from "@/components/timezone-combobox";
import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { ClientApiError } from "@/lib/http";
import {
  fetchNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
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

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}

export function PortalNotificationsForm() {
  const t = useTranslations("portal.account.notifications");
  const { activeBusiness } = usePortalBusiness();
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState<NotificationPrefs | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [receiptsEnabled, setReceiptsEnabled] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [messagesEnabled, setMessagesEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const organizationId = scope === "all" ? null : scope;

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setLoadError(null);
      try {
        const prefs = await fetchNotificationPrefs(organizationId);
        if (cancelled) {
          return;
        }
        applyPrefs(prefs);
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

  function applyPrefs(prefs: NotificationPrefs): void {
    setLoaded(prefs);
    setEmailEnabled(prefs.emailEnabled);
    setSmsEnabled(prefs.smsEnabled);
    setPushEnabled(prefs.pushEnabled);
    setRemindersEnabled(prefs.remindersEnabled);
    setMarketingEnabled(prefs.marketingEnabled);
    setReceiptsEnabled(prefs.receiptsEnabled);
    setWaitlistEnabled(prefs.waitlistEnabled);
    setMessagesEnabled(prefs.messagesEnabled);
    setQuietStart(prefs.quietHoursStart ?? "");
    setQuietEnd(prefs.quietHoursEnd ?? "");
    setTimezone(prefs.timezone || "UTC");
    setFieldErrors({});
  }

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const saved = await updateNotificationPrefs(
        {
          emailEnabled,
          remindersEnabled,
          marketingEnabled,
          receiptsEnabled,
          waitlistEnabled,
          messagesEnabled,
          quietHoursStart: quietStart || null,
          quietHoursEnd: quietEnd || null,
          timezone,
          ...(loaded?.smsAvailable ? { smsEnabled } : {}),
          ...(loaded?.pushAvailable ? { pushEnabled } : {}),
        },
        organizationId,
      );
      applyPrefs(saved);
      setNotice(t("saved"));
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
      setFormError(messageOf(error, t("saveError")));
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
      {activeBusiness ? (
        <div className="grid gap-2">
          <Label htmlFor="notification-scope">{t("scope")}</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger id="notification-scope" className="w-full min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("scopeAll")}</SelectItem>
              <SelectItem value={activeBusiness.organizationId}>
                {t("scopeBusiness", { business: activeBusiness.name })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("securityTitle")}</legend>
        <p className="text-sm text-muted-foreground">{t("securityRequired")}</p>
        <ToggleRow
          id="notify-security"
          label={t("securitySwitch")}
          checked
          disabled
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("confirmationsTitle")}</legend>
        <p className="text-sm text-muted-foreground">{t("confirmationsRequired")}</p>
        <ToggleRow
          id="notify-confirmations"
          label={t("confirmationsSwitch")}
          checked
          disabled
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("channels")}</legend>
        <ToggleRow
          id="notify-email"
          label={t("email")}
          hint={t("emailHint")}
          checked={emailEnabled}
          onCheckedChange={setEmailEnabled}
        />
        <ToggleRow
          id="notify-sms"
          label={t("sms")}
          hint={t("smsHint")}
          checked={loaded?.smsAvailable ? smsEnabled : false}
          disabled={!loaded?.smsAvailable}
          onCheckedChange={setSmsEnabled}
        />
        <ToggleRow
          id="notify-push"
          label={t("push")}
          hint={t("pushHint")}
          checked={loaded?.pushAvailable ? pushEnabled : false}
          disabled={!loaded?.pushAvailable}
          onCheckedChange={setPushEnabled}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("categories")}</legend>
        <ToggleRow
          id="notify-reminders"
          label={t("reminders")}
          hint={t("remindersHint")}
          checked={remindersEnabled}
          onCheckedChange={setRemindersEnabled}
        />
        <ToggleRow
          id="notify-marketing"
          label={t("marketing")}
          hint={t("marketingHint")}
          checked={marketingEnabled}
          onCheckedChange={setMarketingEnabled}
        />
        <ToggleRow
          id="notify-receipts"
          label={t("receipts")}
          hint={t("receiptsHint")}
          checked={receiptsEnabled}
          onCheckedChange={setReceiptsEnabled}
        />
        <ToggleRow
          id="notify-waitlist"
          label={t("waitlist")}
          hint={t("waitlistHint")}
          checked={waitlistEnabled}
          onCheckedChange={setWaitlistEnabled}
        />
        <ToggleRow
          id="notify-messages"
          label={t("messages")}
          hint={t("messagesHint")}
          checked={messagesEnabled}
          onCheckedChange={setMessagesEnabled}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t("quietHours")}</legend>
        <p className="text-sm text-muted-foreground">{t("quietHoursHint")}</p>
        <div className="grid gap-2">
          <Label id="notify-timezone-label" htmlFor="notify-timezone">
            {t("timezone")}
          </Label>
          <TimezoneCombobox
            id="notify-timezone"
            labelledBy="notify-timezone-label"
            value={timezone}
            onChange={setTimezone}
            className="min-h-11 w-full"
          />
          <FieldError id="notify-timezone-error" messages={fieldErrors.timezone} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="notify-quiet-start">{t("quietStart")}</Label>
            <Input
              id="notify-quiet-start"
              type="time"
              value={quietStart}
              onChange={(event) => setQuietStart(event.target.value.slice(0, 5))}
              className="min-h-11"
            />
            <FieldError id="notify-quiet-start-error" messages={fieldErrors.quietHoursStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notify-quiet-end">{t("quietEnd")}</Label>
            <Input
              id="notify-quiet-end"
              type="time"
              value={quietEnd}
              onChange={(event) => setQuietEnd(event.target.value.slice(0, 5))}
              className="min-h-11"
            />
            <FieldError id="notify-quiet-end-error" messages={fieldErrors.quietHoursEnd} />
          </div>
        </div>
      </fieldset>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11" disabled={saving}>
        {saving ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
