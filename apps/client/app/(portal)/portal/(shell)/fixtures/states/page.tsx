"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@shedflow/ui/components";

import {
  PortalEmptyState,
  PortalErrorState,
  PortalSkeleton,
} from "@/components/portal/portal-states";

type Fixture = "loading" | "empty" | "error";

/**
 * Dev fixture for portal loading / empty / error states (T-046 acceptance).
 * Reachable at `/portal/fixtures/states` when signed in as a customer.
 */
export default function PortalStatesFixturePage() {
  const t = useTranslations("portal.fixtures");
  const states = useTranslations("portal.states");
  const [fixture, setFixture] = useState<Fixture>("loading");

  return (
    <section className="space-y-4" aria-labelledby="portal-fixtures-heading">
      <div>
        <h1 id="portal-fixtures-heading" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["loading", "empty", "error"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            variant={fixture === key ? "default" : "outline"}
            className="min-h-11"
            onClick={() => setFixture(key)}
          >
            {t(key)}
          </Button>
        ))}
      </div>
      {fixture === "loading" ? <PortalSkeleton rows={3} /> : null}
      {fixture === "empty" ? (
        <PortalEmptyState title={states("emptyTitle")} description={states("emptyBody")} />
      ) : null}
      {fixture === "error" ? (
        <PortalErrorState message={states("sampleError")} onRetry={() => setFixture("loading")} />
      ) : null}
    </section>
  );
}
