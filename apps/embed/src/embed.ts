const APP_URL = (document.currentScript as HTMLScriptElement | null)?.dataset.app
  ?? (window as { SCHEDFLOW_APP_URL?: string }).SCHEDFLOW_APP_URL
  ?? "http://localhost:3000";

function bookingSrc(org: string, event: string, embed = true): string {
  const url = `${APP_URL}/embed/${encodeURIComponent(org)}/${encodeURIComponent(event)}`;
  return embed ? `${url}?embed=1` : url;
}

function mountInline(node: Element): void {
  const org = node.getAttribute("data-org");
  const event = node.getAttribute("data-event");
  if (!org || !event) {
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.src = bookingSrc(org, event);
  iframe.title = "SchedFlow booking";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.minHeight = "640px";
  iframe.setAttribute("data-schedflow-frame", "inline");
  node.appendChild(iframe);
}

function openPopup(org: string, event: string): void {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-schedflow-overlay", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px";
  const iframe = document.createElement("iframe");
  iframe.src = bookingSrc(org, event);
  iframe.title = "SchedFlow booking";
  iframe.style.cssText =
    "width:min(920px,100%);height:min(720px,100%);border:0;border-radius:16px;background:#fff";
  overlay.appendChild(iframe);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (eventClick) => {
    if (eventClick.target === overlay) {
      close();
    }
  });
  document.addEventListener("keydown", function onKey(eventKey) {
    if (eventKey.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKey);
    }
  });
  window.addEventListener("message", function onMessage(eventMessage) {
    const data = eventMessage.data as { type?: string };
    if (data?.type === "schedflow:close" || data?.type === "schedflow:booked") {
      close();
      window.removeEventListener("message", onMessage);
    }
  });
  document.body.appendChild(overlay);
}

function bindPopups(): void {
  document.querySelectorAll<HTMLElement>("[data-schedflow-popup]").forEach((button) => {
    button.addEventListener("click", () => {
      const org = button.getAttribute("data-org");
      const event = button.getAttribute("data-event");
      if (org && event) {
        openPopup(org, event);
      }
    });
  });
}

window.addEventListener("message", (event) => {
  const data = event.data as { type?: string; height?: number };
  if (data?.type === "schedflow:resize" && typeof data.height === "number") {
    document.querySelectorAll<HTMLIFrameElement>("iframe[data-schedflow-frame]").forEach((frame) => {
      if (frame.contentWindow === event.source) {
        frame.style.height = `${data.height}px`;
      }
    });
  }
});

document.querySelectorAll(".schedflow-inline").forEach(mountInline);
bindPopups();
