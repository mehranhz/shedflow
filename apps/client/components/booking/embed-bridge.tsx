"use client";

import { useEffect } from "react";

import { isEmbeddedFrame, postEmbedResize } from "@/lib/embed-messages";

/**
 * When the booking UI runs inside the embed iframe, report content height to the
 * parent widget (`schedflow:resize`) so inline frames can grow with the form.
 */
export function EmbedBridge({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !isEmbeddedFrame()) {
      return;
    }

    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
          document.documentElement.offsetHeight,
        );
        postEmbedResize(height);
      });
    };

    publish();

    const observer = new ResizeObserver(() => publish());
    observer.observe(document.documentElement);
    if (document.body) {
      observer.observe(document.body);
    }

    window.addEventListener("load", publish);
    window.addEventListener("resize", publish);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("load", publish);
      window.removeEventListener("resize", publish);
    };
  }, [enabled]);

  return null;
}
