# SchedFlow embed widget

Vanilla IIFE (`embed.js`, no React) for inline iframe + popup booking.

## Snippet (dashboard copy lands in T-030)

```html
<script src="https://cdn.schedflow.com/embed.js" data-app="https://app.schedflow.com" async></script>
<div class="schedflow-inline" data-org="acme" data-event="intro"></div>
<button data-schedflow-popup data-org="acme" data-event="intro">Book</button>
```

Local defaults: `data-app` / `window.SCHEDFLOW_APP_URL` → `http://localhost:3000`.

Inline iframe: `{APP_URL}/embed/{org}/{event}`.

Parent listens for iframe `postMessage` (iframe origin = app URL):

| `type` | Effect |
| --- | --- |
| `schedflow:resize` + `height` | Sets matching iframe height |
| `schedflow:close` | Closes popup |
| `schedflow:booked` (+ optional `uid`) | Closes popup |

The Next booking UI (`/embed/…` and `?embed=1`) posts these when framed:
`EmbedBridge` → resize; `SlotPicker` → `schedflow:booked` after a successful book.

Popup also closes on **Esc**, overlay click, and the × button.

## Develop / demo

```bash
# Next client on :3000
pnpm --filter client dev

# Demo page on http://127.0.0.1:5180/
pnpm --filter @shedflow/embed dev
```

`demo.html` mounts an inline iframe against the local client and a popup button.
Use **Simulate schedflow:booked** (or Esc) to verify popup close.

## Build + size

```bash
pnpm --filter @shedflow/embed build
pnpm --filter @shedflow/embed size
pnpm --filter @shedflow/embed accept   # Esc + schedflow:booked (DOM stub)
```

**Target:** gzip(dist/embed.js) **&lt; 8 KB**.

Measured (2026-09-21): **raw 3.79 KB · gzip 1.63 KB**.
