"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shedflow/ui/components";

type UnsavedCopy = {
  title: string;
  body: string;
  stay: string;
  leave: string;
};

export function useUnsavedChangesGuard(dirty: boolean, copy: UnsavedCopy) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(next);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  const dialog = (
    <AlertDialog
      open={pendingHref !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPendingHref(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.stay}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const href = pendingHref;
              setPendingHref(null);
              if (href) {
                router.push(href);
              }
            }}
          >
            {copy.leave}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return dialog;
}
