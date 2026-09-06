/* Cache the shell so the app opens with no signal. Trip data lives in
   localStorage, not here, so a stale cache can never serve stale places. */
const V = "tripkit-v2";
const SHELL = ["./", "./index.html", "./style.css", "./engine.js",
               "./sources.js", "./sun.js", "./app.js", "./manifest.webmanifest", "./icon.svg",
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
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
