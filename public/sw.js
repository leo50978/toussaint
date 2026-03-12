const CACHE_VERSION = "vichly-pwa-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STATIC_ASSETS = [
  "/",
  "/chat",
  "/status",
  "/manifest.webmanifest",
  "/offline.html",
  "/pwa/icon.svg",
  "/pwa/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/pwa/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (!isSameOrigin(url) || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();

          event.waitUntil(
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone)),
          );

          return response;
        })
        .catch(async () => {
          const runtimeMatch = await caches.match(request);

          if (runtimeMatch) {
            return runtimeMatch;
          }

          return (
            (await caches.match("/offline.html")) ||
            Response.error()
          );
        }),
    );

    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(async (cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetch(request);
        const responseClone = networkResponse.clone();

        event.waitUntil(
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone)),
        );

        return networkResponse;
      }),
    );

    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();

        event.waitUntil(
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone)),
        );

        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const targetUrl =
    notification && notification.data && typeof notification.data.url === "string"
      ? notification.data.url
      : "/";

  notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
