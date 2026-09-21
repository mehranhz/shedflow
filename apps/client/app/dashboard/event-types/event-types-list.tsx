"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";
import { Code2, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { APP_URL } from "@/lib/public-config";
import { schedulingApi } from "@/lib/scheduling";
import type { EventType } from "@/lib/types";

const EMBED_SCRIPT =
  process.env.NEXT_PUBLIC_EMBED_SCRIPT_URL ??
  "https://cdn.schedflow.com/embed.js";

export function EventTypesList() {
  const t = useTranslations("dashboard.eventTypes");
  const tc = useTranslations("dashboard.common");
  const { organization, profile } = useOrg();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["event-types", organization.id],
    queryFn: () => schedulingApi.listEventTypes(organization, profile.id),
  });

  const items = query.data?.data ?? [];
  const freeNearLimit =
    organization.platformPlan === "FREE" &&
    items.filter((item) => item.isActive).length >= 3;

  const locationLabel = (eventType: EventType): string => {
    switch (eventType.locationType) {
      case "GOOGLE_MEET":
        return t("locations.GOOGLE_MEET");
      case "PHONE":
        return t("locations.PHONE");
      case "IN_PERSON":
        return eventType.locationValue || t("locations.IN_PERSON");
      case "LINK":
        return eventType.locationValue || t("locations.LINK");
      default:
        return eventType.locationValue || t("locations.CUSTOM");
    }
  };

  const toggleActive = useMutation({
    mutationFn: (eventType: EventType) =>
      schedulingApi.updateEventType(organization, profile.id, eventType.id, {
        isActive: !eventType.isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event-types", organization.id] });
      toast.success(t("updated"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("updateFailed"));
    },
  });

  const copyLink = async (eventType: EventType) => {
    const url = `${APP_URL}/${organization.slug}/${eventType.slug}`;
    await navigator.clipboard.writeText(url);
    toast.success(t("linkCopied"));
  };

  const copyEmbed = async (eventType: EventType) => {
    const snippet = [
      `<script src="${EMBED_SCRIPT}" async></script>`,
      `<div class="schedflow-inline" data-org="${organization.slug}" data-event="${eventType.slug}"></div>`,
    ].join("\n");
    await navigator.clipboard.writeText(snippet);
    toast.success(t("embedCopied"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/dashboard/event-types/new">{t("new")}</Link>
          </Button>
        }
      />

      {freeNearLimit ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          {t("freeLimit")}{" "}
          <Link href="/dashboard/billing" className="font-medium underline underline-offset-2">
            {t("upgrade")}
          </Link>{" "}
          {t("upgradeMore")}
        </p>
      ) : null}

      {query.isLoading ? <TableSkeleton /> : null}
      {query.error ? (
        <QueryError
          message={
            query.error instanceof Error ? query.error.message : t("loadFailed")
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && items.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyBody")}
          actionHref="/dashboard/event-types/new"
          actionLabel={t("newShort")}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEvent")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("colDuration")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("colLocation")}</TableHead>
                <TableHead>{t("colActive")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((eventType) => (
                <TableRow key={eventType.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/event-types/${eventType.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {eventType.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        /{organization.slug}/{eventType.slug}
                      </p>
                      {eventType.isHidden ? (
                        <Badge variant="secondary" className="mt-1">
                          {t("hidden")}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {tc("minutes", { count: eventType.durationMinutes })}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {locationLabel(eventType)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={eventType.isActive}
                      disabled={toggleActive.isPending}
                      onCheckedChange={() => toggleActive.mutate(eventType)}
                      aria-label={t("toggleActive", { title: eventType.title })}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">{tc("openMenu")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/event-types/${eventType.id}`}>
                            {t("edit")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyLink(eventType)}>
                          <Copy className="size-3.5" />
                          {t("copyLink")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyEmbed(eventType)}>
                          <Code2 className="size-3.5" />
                          {t("copyEmbed")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${organization.slug}/${eventType.slug}`}
                            target="_blank"
                          >
                            <ExternalLink className="size-3.5" />
                            {t("viewPage")}
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {query.data?.source === "preview" ? (
        <p className="text-xs text-muted-foreground">{t("previewNote")}</p>
      ) : null}
    </div>
  );
}
