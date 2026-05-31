// Now Brief PWA shell — network-first SW. Backend API calls bypass cache.
const CACHE_NAME = "nb-shell-v5";
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=4",
  "./app.js?v=4",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "no-cache" })).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Cross-origin API requests (to the Mac backend) — never touch cache
  if (url.origin !== location.origin) return;
  // Same-origin shell — network first, cache fallback
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("./")))
  );
});

// ── Web Push — wake-up "brief ready" ───────────────────────────────
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Now Brief", {
    body: d.body || "Your morning brief is ready.",
    icon: d.icon || "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: d.tag || "now-brief",
    renotify: true,
    requireInteraction: true,
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) { if ("focus" in c) { await c.focus(); return; } }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
