"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@shedflow/ui/components";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function OnboardingPage() {
  const t = useTranslations("dashboard.onboarding");
  const tc = useTranslations("dashboard.common");
  const { organization, profile } = useOrg();
  const events = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });
  const count = events.data?.data.length ?? 0;
  const steps = [
    { key: "workspace" as const, done: true, href: "/dashboard/settings" },
    { key: "availability" as const, done: count > 0, href: "/dashboard/availability" },
    { key: "eventType" as const, done: count > 0, href: "/dashboard/event-types/new" },
    { key: "share" as const, done: count > 0, href: "/dashboard/event-types" },
  ];
  const complete = steps.filter((step) => step.done).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Progress value={(complete / steps.length) * 100} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("progress", { complete, total: steps.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/40"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span className="flex size-6 items-center justify-center rounded-full border">
                  {step.done ? <Check className="size-4 text-emerald-600" /> : null}
                </span>
                {t(`steps.${step.key}`)}
              </span>
              <Button size="sm" variant={step.done ? "outline" : "default"}>
                {step.done ? tc("edit") : tc("start")}
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
