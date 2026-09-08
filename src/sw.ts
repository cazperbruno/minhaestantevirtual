/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

const PRECACHE = "readify-precache-v2";
const NAV_CACHE = "readify-navigation-v2";
const COVER_CACHE = "readify-book-covers-v2";
const FONT_CACHE = "readify-fonts-v2";

const PRECACHE_URLS = self.__WB_MANIFEST.map((entry) =>
  new URL(entry.url, self.location.origin).href,
);

const OBSOLETE_CACHE_NAMES = new Set([
  "html-pages",
  "static-resources",
  "google-fonts",
  "book-covers",
  "supabase-api",
]);

function isSupabaseRequest(url: URL): boolean {
  return url.hostname.endsWith(".supabase.co");
}

function isBookCover(url: URL, request: Request): boolean {
  if (request.destination !== "image") return false;
  return (
    /covers\.openlibrary\.org$/i.test(url.hostname) ||
    /(^|\.)googleusercontent\.com$/i.test(url.hostname) ||
    /(^|\.)books\.google\.com$/i.test(url.hostname) ||
    /(^|\.)mzstatic\.com$/i.test(url.hostname) ||
    /(^|\.)archive\.org$/i.test(url.hostname) ||
    /(^|\.)wikimedia\.org$/i.test(url.hostname) ||
    /(^|\.)wikipedia\.org$/i.test(url.hostname) ||
    /(^|\.)anilist\.co$/i.test(url.hostname)
  );
}

function isGoogleFont(url: URL): boolean {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

function safeInternalPath(value: unknown): string {
  try {
    const raw = typeof value === "string" && value.trim() ? value.trim() : "/";
    const resolved = new URL(raw, self.location.origin);
    if (resolved.origin !== self.location.origin) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
}

async function precacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  return fetch(request);
}

async function navigationNetworkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(NAV_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // HTML shell contains no authenticated user data; it is safe to cache.
      await cache.put(new Request(new URL("/", self.location.origin)), response.clone());
    }
    return response;
  } catch {
    const cachedNav = await cache.match(new Request(new URL("/", self.location.origin)));
    if (cachedNav) return cachedNav;

    const precache = await caches.open(PRECACHE);
    const fallback =
      (await precache.match(new URL("/index.html", self.location.origin).href)) ||
      (await precache.match(new URL("/", self.location.origin).href));
    if (fallback) return fallback;
    throw new Error("offline_navigation_unavailable");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  // Prompt-update semantics: do NOT skipWaiting automatically.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      const obsolete =
        OBSOLETE_CACHE_NAMES.has(name) ||
        name.includes("supabase-api") ||
        name.startsWith("workbox-precache") ||
        (name.startsWith("readify-") && ![PRECACHE, NAV_CACHE, COVER_CACHE, FONT_CACHE].includes(name));
      return obsolete ? caches.delete(name) : Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Critical privacy rule: authenticated Supabase REST/functions/storage requests
  // never enter CacheStorage. User-scoped caching stays in application state only.
  if (isSupabaseRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && ["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(precacheFirst(request));
    return;
  }

  if (isBookCover(url, request)) {
    event.respondWith(cacheFirst(request, COVER_CACHE));
    return;
  }

  if (isGoogleFont(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let data: Record<string, unknown> = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Readify", body: event.data?.text() || "" };
  }

  const title = typeof data.title === "string" && data.title.trim()
    ? data.title.trim().slice(0, 120)
    : "Readify";
  const body = typeof data.body === "string" ? data.body.slice(0, 500) : "";
  const link = safeInternalPath(data.link);
  const notificationId = typeof data.notification_id === "string"
    ? data.notification_id
    : undefined;

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link, notification_id: notificationId },
    tag: notificationId,
    renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeInternalPath(event.notification.data?.link);
  const target = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) continue;
      if ("navigate" in client) {
        try { await client.navigate(target); } catch { /* best effort */ }
      }
      await client.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
