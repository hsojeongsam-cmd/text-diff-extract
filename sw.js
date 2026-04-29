// Service worker: precaches the app shell, intercepts share_target POSTs,
// and falls back to network-first for navigations.
const VERSION = "v1";
const APP_CACHE = `wa-extract-app-${VERSION}`;
const SHARED_CACHE = "shared-files";

const APP_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./parser.js",
  "./manifest.webmanifest",
  "./vendor/jszip.min.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_FILES.map((f) => cache.add(f)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("wa-extract-app-") && k !== APP_CACHE)
        .map((k) => caches.delete(k)),
    );
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (e.request.method === "POST" && url.pathname.endsWith("/share")) {
    e.respondWith(handleShare(e.request));
    return;
  }

  if (e.request.method !== "GET") return;

  if (e.request.mode === "navigate") {
    e.respondWith(networkFirst(e.request));
  } else if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(e.request));
  }
});

async function networkFirst(req) {
  try {
    const resp = await fetch(req);
    const cache = await caches.open(APP_CACHE);
    cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return caches.match("./index.html") || new Response("offline", { status: 503 });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    return new Response("offline", { status: 503 });
  }
}

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f) => f && f.name);
    const cache = await caches.open(SHARED_CACHE);
    for (const k of await cache.keys()) await cache.delete(k);
    for (const f of files) {
      const url = `./shared/${encodeURIComponent(f.name)}`;
      await cache.put(
        new Request(url),
        new Response(f, {
          headers: { "Content-Type": f.type || "application/octet-stream" },
        }),
      );
    }
    const target = files.length ? "./?shared=1" : "./";
    return Response.redirect(target, 303);
  } catch (e) {
    return new Response("share handler error: " + e.message, { status: 500 });
  }
}
