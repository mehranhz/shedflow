"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@shedflow/ui/components";
import { ChevronsUpDown } from "lucide-react";

import { usePortalBusiness } from "@/components/portal/portal-business-context";

export function BusinessSwitcherSheet() {
  const t = useTranslations("portal.shell");
  const { businesses, activeBusiness, switchBusiness, loading } = usePortalBusiness();
  const [open, setOpen] = useState(false);

  if (businesses.length <= 1) {
    return (
      <span className="truncate text-sm font-semibold">
        {activeBusiness?.name ?? t("defaultBusiness")}
      </span>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 max-w-[14rem] gap-1 px-2 font-semibold"
          aria-label={t("switchBusiness")}
        >
          <span className="truncate">{activeBusiness?.name ?? t("defaultBusiness")}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{t("switchBusiness")}</SheetTitle>
          <SheetDescription>{t("switchBusinessHint")}</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-1" role="list">
          {businesses.map((business) => {
            const active = business.organizationId === activeBusiness?.organizationId;
            return (
              <li key={business.organizationId}>
                <Button
                  type="button"
                  variant={active ? "secondary" : "ghost"}
                  disabled={loading || active}
                  className="h-11 w-full justify-start gap-2"
                  onClick={() => {
                    void switchBusiness(business.organizationId).then(() => setOpen(false));
                  }}
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: business.brandColor ?? "#64748b" }}
                    aria-hidden
                  />
                  <span className="truncate">{business.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
