/**
 * SchedFlow embed widget (IIFE, no React).
 *
 * Usage:
 *   <script src="…/embed.js" data-app="https://app.example.com" async></script>
 *   <div class="schedflow-inline" data-org="acme" data-event="intro"></div>
 *   <button data-schedflow-popup data-org="acme" data-event="intro">Book</button>
 *
 * Iframe → parent postMessage:
 *   { type: "schedflow:resize", height: number }
 *   { type: "schedflow:close" }
 *   { type: "schedflow:booked", uid?: string }
 */

type SchedflowMessage = {
  type?: string;
  height?: number;
  uid?: string;
};

const scriptEl = document.currentScript as HTMLScriptElement | null;

function resolveAppUrl(): string {
  const fromDataset = scriptEl?.dataset.app?.trim();
  if (fromDataset) {
    return fromDataset.replace(/\/$/, "");
  }
  const fromGlobal = (window as Window & { SCHEDFLOW_APP_URL?: string }).SCHEDFLOW_APP_URL?.trim();
  if (fromGlobal) {
    return fromGlobal.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

const APP_URL = resolveAppUrl();

function appOrigin(): string {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return APP_URL;
  }
}

function bookingSrc(org: string, event: string): string {
  return `${APP_URL}/embed/${encodeURIComponent(org)}/${encodeURIComponent(event)}`;
}

function isTrustedMessage(event: MessageEvent): boolean {
  if (event.origin === appOrigin()) {
    return true;
  }
  // Host page may simulate close/booked (demo.html); iframe posts use APP origin.
  if (event.source === window) {
    return true;
  }
  // file:// / opaque origins in local fixtures
  if (!event.origin || event.origin === "null") {
    return true;
  }
  return false;
}

function parseMessage(data: unknown): SchedflowMessage | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as SchedflowMessage;
}

function mountInline(node: Element): void {
  if (node.querySelector("iframe[data-schedflow-frame]")) {
    return;
  }
  const org = node.getAttribute("data-org");
  const event = node.getAttribute("data-event");
  if (!org || !event) {
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.src = bookingSrc(org, event);
  iframe.title = "SchedFlow booking";
  iframe.setAttribute("data-schedflow-frame", "inline");
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = "width:100%;border:0;min-height:640px;display:block;background:transparent";
  node.appendChild(iframe);
}

type PopupHandles = {
  close: () => void;
};

function openPopup(org: string, event: string): PopupHandles {
  const active = document.activeElement;
  const previousFocus =
    active && typeof (active as HTMLElement).focus === "function"
      ? (active as HTMLElement)
      : null;

  const overlay = document.createElement("div");
  overlay.setAttribute("data-schedflow-overlay", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Book a meeting");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:relative;width:min(920px,100%);height:min(720px,100%);border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 25px 50px rgba(0,0,0,.25)";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "position:absolute;top:8px;right:10px;z-index:2;border:0;background:rgba(15,23,42,.7);color:#fff;width:32px;height:32px;border-radius:999px;cursor:pointer;font-size:20px;line-height:1";

  const iframe = document.createElement("iframe");
  iframe.src = bookingSrc(org, event);
  iframe.title = "SchedFlow booking";
  iframe.setAttribute("data-schedflow-frame", "popup");
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;background:#fff";

  panel.appendChild(closeBtn);
  panel.appendChild(iframe);
  overlay.appendChild(panel);

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("message", onMessage);
    overlay.remove();
    previousFocus?.focus();
  };

  const onKey = (eventKey: KeyboardEvent) => {
    if (eventKey.key === "Escape") {
      eventKey.preventDefault();
      close();
      return;
    }
    if (eventKey.key !== "Tab") {
      return;
    }
    // Keep focus inside the dialog (close button ↔ iframe).
    const focusables = [closeBtn, iframe];
    const active = document.activeElement;
    const index = focusables.indexOf(active as HTMLElement);
    eventKey.preventDefault();
    if (eventKey.shiftKey) {
      focusables[(index <= 0 ? focusables.length : index) - 1]?.focus();
    } else {
      focusables[(index + 1) % focusables.length]?.focus();
    }
  };

  const onMessage = (eventMessage: MessageEvent) => {
    if (!isTrustedMessage(eventMessage)) {
      return;
    }
    const data = parseMessage(eventMessage.data);
    if (!data) {
      return;
    }
    if (data.type === "schedflow:close" || data.type === "schedflow:booked") {
      close();
    }
  };

  closeBtn.addEventListener("click", () => close());
  overlay.addEventListener("click", (eventClick) => {
    if (eventClick.target === overlay) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("message", onMessage);
  document.body.appendChild(overlay);
  closeBtn.focus();

  return { close };
}

function bindPopups(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-schedflow-popup]").forEach((button) => {
    if (button.dataset.schedflowBound === "1") {
      return;
    }
    button.dataset.schedflowBound = "1";
    button.addEventListener("click", (eventClick) => {
      eventClick.preventDefault();
      const org = button.getAttribute("data-org");
      const eventName = button.getAttribute("data-event");
      if (org && eventName) {
        openPopup(org, eventName);
      }
    });
  });
}

function mountAllInlines(root: ParentNode = document): void {
  root.querySelectorAll(".schedflow-inline").forEach(mountInline);
}

window.addEventListener("message", (event) => {
  if (!isTrustedMessage(event)) {
    return;
  }
  const data = parseMessage(event.data);
  if (!data || data.type !== "schedflow:resize" || typeof data.height !== "number") {
    return;
  }
  const height = Math.max(320, Math.round(data.height));
  document.querySelectorAll<HTMLIFrameElement>("iframe[data-schedflow-frame]").forEach((frame) => {
    if (frame.contentWindow === event.source) {
      frame.style.height = `${height}px`;
    }
  });
});

function boot(): void {
  mountAllInlines();
  bindPopups();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// Expose helpers for demos / host pages that want to open a popup manually.
(window as Window & { SchedflowEmbed?: unknown }).SchedflowEmbed = {
  open: openPopup,
  appUrl: APP_URL,
};
