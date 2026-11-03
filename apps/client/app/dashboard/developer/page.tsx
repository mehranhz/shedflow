"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";
import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";

export default function DeveloperPage() {
  const t = useTranslations("dashboard.developer");
  const { organization } = useOrg();
  const isFree = organization.platformPlan === "FREE";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {isFree ? (
        <Alert>
          <AlertTitle>{t("upgradeTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("upgradeBody")}</span>
            <Button size="sm" className="shrink-0" asChild>
              <Link href="/dashboard/billing">{t("viewBilling")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>{t("comingTitle")}</AlertTitle>
          <AlertDescription>{t("comingBody")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("apiKeys")}</CardTitle>
          <CardDescription>{t("noKeys")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isFree ? t("freeKeysHint") : t("proKeysHint")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("webhooks")}</CardTitle>
          <CardDescription>{t("noWebhooks")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("webhooksHint")}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard/billing">{t("viewBilling")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
