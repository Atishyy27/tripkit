/* Cache the shell so the app opens with no signal. Trip data lives in
   localStorage, not here, so a stale cache can never serve stale places. */
const V = "tripkit-v12";
const SHELL = ["./", "./index.html", "./style.css", "./engine.js",
               "./sources.js", "./sun.js", "./app.js", "./manifest.webmanifest", "./icon.svg", "./llms.txt", "./og.svg",
               "./vendor/leaflet.js", "./vendor/leaflet.css",
               "./vendor/images/marker-icon.png", "./vendor/images/marker-icon-2x.png",
               "./vendor/images/marker-shadow.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;          // never cache other people's APIs

  // Network first, cache as the fallback. The other way round is faster and it is
  // how this app shipped a broken build to anyone who had already opened it: they
  // kept getting the cached shell and no amount of fixing reached them. Offline
  // still works, because the cache answers the moment the network does not.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(V).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

// Let the page ask for an immediate takeover after an update.
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
