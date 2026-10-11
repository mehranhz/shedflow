/* SchedFlow portal service worker (T-078). Scope: /portal/ only.
 * Shell + offline fallback are cached. API calls are network-first (no stale bookings).
 */
const CACHE = "shedflow-portal-shell-v1";
const OFFLINE_URL = "/portal/offline";
const PRECACHE = [
  "/portal",
  "/portal/offline",
  "/portal/manifest.webmanifest",
  "/portal/icons/icon-192.png",
  "/portal/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/v1/") ||
    url.hostname !== self.location.hostname
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never claim staff dashboard or non-portal routes.
  if (!url.pathname.startsWith("/portal")) {
    return;
  }

  // Network-first for API / BFF — bookings must not be served stale.
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Offline" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    return;
  }

  // Navigation: network-first, offline fallback page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }),
    );
    return;
  }

  // Static assets: cache-first with network update.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
