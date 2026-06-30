// 간단한 PWA 서비스 워커 — 앱 셸 캐시
const CACHE = "pickleball-v3";
const ASSETS = [
  "./", "./index.html", "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/config.js", "./assets/js/db.js", "./assets/js/app.js",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/images/hero.jpg"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match("./index.html")))
  );
});
