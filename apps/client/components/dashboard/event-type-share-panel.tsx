"use client";

import { useState } from "react";
import { Code2, Copy, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@shedflow/ui/components";

import { APP_URL } from "@/lib/public-config";

const EMBED_SCRIPT =
  process.env.NEXT_PUBLIC_EMBED_SCRIPT_URL ??
  "https://cdn.schedflow.com/embed.js";

export function EventTypeSharePanel({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const t = useTranslations("dashboard.eventTypes.share");
  const publicUrl = `${APP_URL}/${orgSlug}/${eventSlug}`;
  const inlineSnippet = [
    `<script src="${EMBED_SCRIPT}" async></script>`,
    `<div class="schedflow-inline" data-org="${orgSlug}" data-event="${eventSlug}"></div>`,
  ].join("\n");
  const popupSnippet = [
    `<script src="${EMBED_SCRIPT}" async></script>`,
    `<button data-schedflow-popup data-org="${orgSlug}" data-event="${eventSlug}">Book</button>`,
  ].join("\n");

  const [tab, setTab] = useState("inline");

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(t("copied", { label }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">
            {publicUrl}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy(t("bookingLink"), publicUrl)}
          >
            <Copy className="size-3.5" />
            {t("copyLink")}
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Link2 className="size-3.5" />
              {t("open")}
            </a>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="inline">{t("inline")}</TabsTrigger>
            <TabsTrigger value="popup">{t("popup")}</TabsTrigger>
          </TabsList>
          <TabsContent value="inline" className="space-y-2">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
              {inlineSnippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copy(t("inlineSnippet"), inlineSnippet)}
            >
              <Code2 className="size-3.5" />
              {t("copySnippet")}
            </Button>
          </TabsContent>
          <TabsContent value="popup" className="space-y-2">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
              {popupSnippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copy(t("popupSnippet"), popupSnippet)}
            >
              <Code2 className="size-3.5" />
              {t("copySnippet")}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
