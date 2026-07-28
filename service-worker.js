const CACHE_VERSION = "pink-promise-working-rollback-v1.0.0";
const APP_CACHE = `${CACHE_VERSION}-app`;
const ICON_CACHE = `${CACHE_VERSION}-icons`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./pwa.js",
  "./google-drive.js",
  "./google-drive-config.js",
  "./firebase-config.js",
  "./starter-gallery.js",
  "./manifest.webmanifest",
  "./offline.html"
];

const ICONS = [
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

function scopedUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

async function cacheIndividually(cacheName, files) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(
    files.map(async (file) => {
      const request = new Request(scopedUrl(file), { cache: "reload" });
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      cacheIndividually(APP_CACHE, APP_SHELL),
      cacheIndividually(ICON_CACHE, ICONS)
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(scopedUrl(fallbackUrl));
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ICON_CACHE);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const response = await network;
  if (response) return response;
  throw new Error("Resource unavailable");
}

async function runtimeCacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cache only static third-party presentation assets. Firebase, Drive, and
  // Google Identity requests stay network-managed and are never cached here.
  if (url.origin !== self.location.origin) {
    if (["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
      event.respondWith(runtimeCacheFirst(request));
    }
    return;
  }

  const path = url.pathname.toLowerCase();

  // Do not fill device cache with the user's large starter gallery.
  if (path.includes("/assets/gallery/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./offline.html"));
    return;
  }

  if (path.includes("/icons/") || path.endsWith("favicon.svg")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (path.endsWith(".js") || path.endsWith(".webmanifest") || path.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (path.endsWith(".html")) {
    event.respondWith(networkFirst(request));
  }
});
