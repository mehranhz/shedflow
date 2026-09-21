/** postMessage contract with `@shedflow/embed` (iframe → parent). */

export type EmbedMessage =
  | { type: "schedflow:resize"; height: number }
  | { type: "schedflow:booked"; uid?: string }
  | { type: "schedflow:close" };

export function isEmbeddedFrame(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.parent !== window;
  } catch {
    // Cross-origin access to parent can throw in some browsers; treat as embedded.
    return true;
  }
}

/** Prefer the embedding page origin; fall back to * when referrer is unavailable. */
export function embedParentTargetOrigin(): string {
  if (typeof document === "undefined") {
    return "*";
  }
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    // ignore
  }
  return "*";
}

export function postToEmbedParent(message: EmbedMessage): boolean {
  if (typeof window === "undefined" || !isEmbeddedFrame()) {
    return false;
  }
  try {
    window.parent.postMessage(message, embedParentTargetOrigin());
    return true;
  } catch {
    try {
      window.parent.postMessage(message, "*");
      return true;
    } catch {
      return false;
    }
  }
}

export function postEmbedResize(height: number): boolean {
  const rounded = Math.max(320, Math.round(height));
  return postToEmbedParent({ type: "schedflow:resize", height: rounded });
}

export function postEmbedBooked(uid: string): boolean {
  return postToEmbedParent({ type: "schedflow:booked", uid });
}

export function postEmbedClose(): boolean {
  return postToEmbedParent({ type: "schedflow:close" });
}
