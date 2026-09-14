"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@shedflow/ui/components";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { schedulingApi } from "@/lib/scheduling";

export default function OnboardingPage() {
  const { organization, profile } = useOrg();
  const events = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });
  const count = events.data?.data.length ?? 0;
  const steps = [
    { label: "Workspace created", done: true, href: "/dashboard/settings" },
    { label: "Set availability", done: count > 0, href: "/dashboard/availability" },
    { label: "Create an event type", done: count > 0, href: "/dashboard/event-types/new" },
    { label: "Share your link", done: count > 0, href: "/dashboard/event-types" },
  ];
  const complete = steps.filter((step) => step.done).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Let’s get you booked"
        description="A few steps to a public page that looks like Calendly — minus the extra tools."
      />
      <Progress value={(complete / steps.length) * 100} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {complete} of {steps.length} complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.label}
              href={step.href}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/40"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span className="flex size-6 items-center justify-center rounded-full border">
                  {step.done ? <Check className="size-4 text-emerald-600" /> : null}
                </span>
                {step.label}
              </span>
              <Button size="sm" variant={step.done ? "outline" : "default"}>
                {step.done ? "Edit" : "Start"}
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
