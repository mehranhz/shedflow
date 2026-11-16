"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Label, Switch } from "@shedflow/ui/components";

import { usePortalBusiness } from "@/components/portal/portal-business-context";
import { formatInTimeZone } from "@/lib/booking-time";
import {
  disconnectPrivacyBusiness,
  fetchPrivacyOverview,
  updatePrivacyConsents,
  type LinkedPrivacyBusiness,
  type PrivacyOverview,
} from "@/lib/portal/customer-api";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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

function recordedAt(value: string | null): string {
  if (!value) {
    return "";
  }
  return formatInTimeZone(value, "UTC", "yyyy-MM-dd HH:mm");
}

export function PortalPrivacyForm() {
  const t = useTranslations("portal.account.privacy");
  const { refresh } = usePortalBusiness();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<PrivacyOverview | null>(null);
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [marketingOffers, setMarketingOffers] = useState(false);

  function applyOverview(next: PrivacyOverview) {
    setOverview(next);
    setMarketingEmail(next.consents.marketingEmail.granted);
    setMarketingOffers(next.consents.marketingOffers.granted);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchPrivacyOverview()
      .then((next) => {
        if (!cancelled) {
          applyOverview(next);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(messageOf(error, t("loadError")));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const saved = await updatePrivacyConsents({ marketingEmail, marketingOffers });
      applyOverview(saved);
      setNotice(t("saved"));
    } catch (error) {
      setFormError(messageOf(error, t("saveError")));
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(business: LinkedPrivacyBusiness) {
    if (!window.confirm(t("disconnectConfirm", { business: business.name }))) {
      return;
    }
    setDisconnectingId(business.organizationId);
    setFormError(null);
    setNotice(null);
    try {
      const next = await disconnectPrivacyBusiness(business.organizationId);
      applyOverview(next);
      setNotice(t("disconnected", { business: business.name }));
      await refresh();
    } catch (error) {
      setFormError(messageOf(error, t("disconnectError")));
    } finally {
      setDisconnectingId(null);
    }
  }

  if (loading && !overview) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (loadError && !overview) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    );
  }

  if (!overview) {
    return null;
  }

  const emailWhen = recordedAt(overview.consents.marketingEmail.consentedAt);
  const offersWhen = recordedAt(overview.consents.marketingOffers.consentedAt);

  return (
    <div className="space-y-6">
      <form onSubmit={(event) => void onSave(event)} className="space-y-6 rounded-lg border p-4">
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">{t("marketingTitle")}</legend>
          <p className="text-sm text-muted-foreground">{t("marketingHint")}</p>
          <ToggleRow
            id="privacy-marketing-email"
            label={t("marketingEmail")}
            hint={t("marketingEmailHint")}
            checked={marketingEmail}
            disabled={saving}
            onCheckedChange={setMarketingEmail}
          />
          <p className="text-sm text-muted-foreground">
            {emailWhen ? t("consentedAt", { when: emailWhen }) : t("notRecorded")}
          </p>
          <ToggleRow
            id="privacy-marketing-offers"
            label={t("marketingOffers")}
            hint={t("marketingOffersHint")}
            checked={marketingOffers}
            disabled={saving}
            onCheckedChange={setMarketingOffers}
          />
          <p className="text-sm text-muted-foreground">
            {offersWhen ? t("consentedAt", { when: offersWhen }) : t("notRecorded")}
          </p>
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
        <Button type="submit" className="min-h-11" disabled={saving || disconnectingId !== null}>
          {saving ? t("saving") : t("save")}
        </Button>
      </form>

      <section className="space-y-4 rounded-lg border p-4" aria-labelledby="privacy-businesses-heading">
        <div>
          <h2 id="privacy-businesses-heading" className="text-sm font-medium">
            {t("businessesTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("businessesHint")}</p>
        </div>
        {overview.businesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("businessesEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {overview.businesses.map((business) => {
              const lastBooking = recordedAt(business.lastBookingAt);
              return (
                <li
                  key={business.organizationId}
                  className="flex min-h-11 flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{business.name}</p>
                    {lastBooking ? (
                      <p className="text-sm text-muted-foreground">
                        {t("lastBooking", { when: lastBooking })}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={disconnectingId !== null || saving}
                    aria-label={t("disconnectNamed", { business: business.name })}
                    onClick={() => void onDisconnect(business)}
                  >
                    {t("disconnect")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-labelledby="privacy-legal-heading">
        <h2 id="privacy-legal-heading" className="text-sm font-medium">
          {t("legalTitle")}
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={overview.links.privacyPolicy}>{t("privacyPolicy")}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={overview.links.terms}>{t("terms")}</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-labelledby="privacy-rights-heading">
        <div>
          <h2 id="privacy-rights-heading" className="text-sm font-medium">
            {t("rightsTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("rightsHint")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={overview.links.export}>{t("export")}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={overview.links.deleteAccount}>{t("deleteAccount")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
