# Embed widget

IIFE bundle used as:

```html
<script src="https://cdn.schedflow.com/embed.js" async></script>
<div class="schedflow-inline" data-org="acme" data-event="intro"></div>
<button data-schedflow-popup data-org="acme" data-event="intro">Book</button>
```

Local:

```bash
pnpm --filter @shedflow/embed build
```

Target gzip size: under 8 KB.
