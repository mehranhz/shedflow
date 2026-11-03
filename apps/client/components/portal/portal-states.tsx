"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from "@shedflow/ui/components";

export function PortalSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function PortalEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function PortalErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("portal.states");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("errorTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{message}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onRetry}>
            {t("retry")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
