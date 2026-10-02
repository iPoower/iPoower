// Tyre Weather Race Control : ouverture hors ligne (réseau d'abord, cache en secours)
const C = 'twrc-v5';
const SHELL = ['./', './index.html', './apple-touch-icon.png', './icon-192.png', './manifest.webmanifest', './tiredb.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // polices Google : cache d'abord (rapide, et disponibles hors ligne)
  if (e.request.method === 'GET' && /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(C).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // pages : toujours la dernière version (on court-circuite le cache HTTP de GitHub Pages)
  const fresh = e.request.mode === 'navigate' || /\.html?$|\/$/.test(u.pathname) ? fetch(e.request, { cache: 'no-store' }) : fetch(e.request);
  e.respondWith(fresh.then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
