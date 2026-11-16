"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
} from "@shedflow/ui/components";

import { ClientApiError } from "@/lib/http";
import {
  changeCustomerPassword,
  confirmCustomerTotp,
  disableCustomerTotp,
  enrollCustomerTotp,
  fetchSecurityOverview,
  fetchSecuritySessions,
  revokeCustomerSession,
  revokeOtherCustomerSessions,
  type SecurityOverview,
  type SecuritySession,
} from "@/lib/portal/customer-api";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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

export function PortalSecurityForm() {
  const t = useTranslations("portal.account.security");
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [passwordTotp, setPasswordTotp] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [enrolling, setEnrolling] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload(): Promise<void> {
    const [nextOverview, nextSessions] = await Promise.all([
      fetchSecurityOverview(),
      fetchSecuritySessions(),
    ]);
    setOverview(nextOverview);
    setSessions(nextSessions.sessions);
  }

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [nextOverview, nextSessions] = await Promise.all([
          fetchSecurityOverview(),
          fetchSecuritySessions(),
        ]);
        if (cancelled) {
          return;
        }
        setOverview(nextOverview);
        setSessions(nextSessions.sessions);
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

  async function onPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingPassword(true);
    setFormError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      await changeCustomerPassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
        ...(passwordTotp.trim() ? { totpCode: passwordTotp.trim() } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordTotp("");
      setRevokeOthers(false);
      setNotice(t("passwordSaved"));
      await reload();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
      setFormError(messageOf(error, t("passwordError")));
    } finally {
      setSavingPassword(false);
    }
  }

  async function onEnroll(): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      setEnrolling(await enrollCustomerTotp());
      setBackupCodes(null);
    } catch (error) {
      setFormError(messageOf(error, t("loadError")));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const confirmed = await confirmCustomerTotp(confirmCode.trim());
      setBackupCodes(confirmed.backupCodes);
      setEnrolling(null);
      setConfirmCode("");
      await reload();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
      setFormError(messageOf(error, t("loadError")));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await disableCustomerTotp(disablePassword, disableCode.trim());
      setDisablePassword("");
      setDisableCode("");
      setBackupCodes(null);
      setNotice(t("disabled"));
      await reload();
    } catch (error) {
      setFieldErrors(readFieldErrors(error));
      setFormError(messageOf(error, t("loadError")));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string): Promise<void> {
    setFormError(null);
    try {
      await revokeCustomerSession(id);
      setNotice(t("revoked"));
      await reload();
    } catch (error) {
      setFormError(messageOf(error, t("loadError")));
    }
  }

  async function onRevokeOthers(): Promise<void> {
    setFormError(null);
    try {
      await revokeOtherCustomerSessions();
      setNotice(t("revoked"));
      await reload();
    } catch (error) {
      setFormError(messageOf(error, t("loadError")));
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (loadError && !overview) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("loadError")}</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <p className="text-sm text-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <form onSubmit={(event) => void onPassword(event)} className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-medium">{t("passwordTitle")}</h2>
        <div className="grid gap-2">
          <Label htmlFor="security-current-password">{t("currentPassword")}</Label>
          <Input
            id="security-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={currentPassword}
            aria-invalid={fieldErrors.currentPassword ? true : undefined}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <FieldError id="security-current-password-error" messages={fieldErrors.currentPassword} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="security-new-password">{t("newPassword")}</Label>
          <Input
            id="security-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            aria-invalid={fieldErrors.newPassword ? true : undefined}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <FieldError id="security-new-password-error" messages={fieldErrors.newPassword} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="security-password-totp">{t("totpCode")}</Label>
          <Input
            id="security-password-totp"
            name="totpCode"
            autoComplete="one-time-code"
            value={passwordTotp}
            aria-describedby="security-password-totp-hint"
            aria-invalid={fieldErrors.totpCode ? true : undefined}
            onChange={(event) => setPasswordTotp(event.target.value)}
          />
          <p id="security-password-totp-hint" className="text-sm text-muted-foreground">
            {t("totpHint")}
          </p>
          <FieldError id="security-password-totp-error" messages={fieldErrors.totpCode} />
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Checkbox
            id="security-revoke-others"
            checked={revokeOthers}
            onCheckedChange={(value) => setRevokeOthers(value === true)}
          />
          <Label htmlFor="security-revoke-others">{t("revokeOthers")}</Label>
        </div>
        <Button type="submit" className="min-h-11" disabled={savingPassword}>
          {savingPassword ? t("saving") : t("savePassword")}
        </Button>
      </form>

      <section className="space-y-4 rounded-lg border p-4" aria-labelledby="security-totp-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="security-totp-heading" className="text-lg font-medium">
            {t("totpTitle")}
          </h2>
          <Badge variant="secondary">{overview?.totpEnabled ? t("totpOn") : t("totpOff")}</Badge>
        </div>
        {overview?.totpEnabled ? (
          <p className="text-sm text-muted-foreground">
            {t("backupRemaining", { count: overview.backupCodesRemaining })}
          </p>
        ) : (
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onEnroll()}>
            {t("startEnroll")}
          </Button>
        )}
        {enrolling ? (
          <form onSubmit={(event) => void onConfirm(event)} className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("enrollHint")}</p>
            <div className="grid gap-2">
              <Label htmlFor="security-totp-secret">{t("secret")}</Label>
              <Input id="security-totp-secret" readOnly value={enrolling.secret} />
            </div>
            <p className="break-all text-sm text-muted-foreground">{enrolling.otpauthUrl}</p>
            <div className="grid gap-2">
              <Label htmlFor="security-totp-confirm">{t("confirmCode")}</Label>
              <Input
                id="security-totp-confirm"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={6}
                value={confirmCode}
                aria-invalid={fieldErrors.code ? true : undefined}
                onChange={(event) => setConfirmCode(event.target.value)}
              />
              <FieldError id="security-totp-confirm-error" messages={fieldErrors.code} />
            </div>
            <Button type="submit" className="min-h-11" disabled={busy}>
              {t("confirm")}
            </Button>
          </form>
        ) : null}
        {backupCodes ? (
          <Alert>
            <AlertTitle>{t("backupTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("backupHint")}</p>
              <ul className="mt-2 grid gap-1 font-mono">
                {backupCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {overview?.totpEnabled ? (
          <form onSubmit={(event) => void onDisable(event)} className="space-y-3">
            <h3 className="text-base font-medium">{t("disableTitle")}</h3>
            <div className="grid gap-2">
              <Label htmlFor="security-disable-password">{t("disablePassword")}</Label>
              <Input
                id="security-disable-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="security-disable-code">{t("totpCode")}</Label>
              <Input
                id="security-disable-code"
                autoComplete="one-time-code"
                required
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" className="min-h-11" disabled={busy}>
              {t("disable")}
            </Button>
          </form>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border p-4" aria-labelledby="security-sessions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="security-sessions-heading" className="text-lg font-medium">
            {t("sessionsTitle")}
          </h2>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void onRevokeOthers()}>
            {t("revokeOthersButton")}
          </Button>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sessionsEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {session.device}
                    {session.current ? ` · ${t("currentSession")}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session.ip ?? "—"} · {t("lastUsed", { when: formatWhen(session.lastUsedAt) })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void onRevoke(session.id)}
                >
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-labelledby="security-linked-heading">
        <h2 id="security-linked-heading" className="text-lg font-medium">
          {t("linkedTitle")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" className="min-h-11" disabled>
            {t("google")} · {t("comingSoon")}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled>
            {t("apple")} · {t("comingSoon")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("passkeys")}</p>
      </section>
    </div>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
