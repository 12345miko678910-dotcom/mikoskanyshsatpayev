const CACHE_NAME = "qanysh-reader-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./javascript.js",
  "./config.js",
  "./manifest.webmanifest",
  "./cover.svg",
  "./icon.svg",
  "./toc.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("qanysh-reader-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  const isPageImage = url.pathname.includes("/pages/");
  if (isPageImage) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
      }))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
