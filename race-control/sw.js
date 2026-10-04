// Tyre Weather Race Control : shell PWA hors ligne + dernières données publiques chiffrées
// Les requêtes vers OSRM, Open-Meteo, BigDataCloud, RainViewer et les tuiles externes ne sont JAMAIS mises en Cache Storage.
const STATIC = 'twrc-static-v8', DATA = 'twrc-data-v3';
const NAV_WAIT_MS = 3000;   // réseau qui ne répond pas (parking, tunnel) : shell en cache au-delà, mise à jour poursuivie en arrière-plan
const SHELL = ['./', './index.html', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './manifest.webmanifest', './tiredb.json'];
const DATA_PATHS = /\/(calendar\.sealed\.json|obs\.json|tiredb\.json|version\.json)$/;

const canonical = u => new Request(u.origin + u.pathname, { method: 'GET' });
async function networkFirst(req, cacheName, key, fallback, event, waitMs) {
  const cache = await caches.open(cacheName), k = key || req;
  if (waitMs) {
    const old = await cache.match(k, { ignoreSearch: true }) || (fallback ? await caches.match(fallback) : null);
    if (old) {
      const net = fetch(req, { cache: 'no-store' }).then(async r => { if (r && r.ok) await cache.put(k, r.clone()); return r; });
      if (event) event.waitUntil(net.catch(() => null));
      const r = await Promise.race([net.catch(() => null), new Promise(res => setTimeout(() => res(null), waitMs))]);
      return r && r.ok ? r : old;
    }
  }
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r && r.ok) { await cache.put(k, r.clone()); return r; }
    // GitHub Pages/CDN peut répondre 5xx sans être techniquement « hors réseau » :
    // dans ce cas on préfère la dernière copie valide plutôt qu'une panne visible.
    const old = await cache.match(k, { ignoreSearch: true }) || (fallback ? await caches.match(fallback) : null);
    return old || r;
  } catch (e) {
    return (await cache.match(k, { ignoreSearch: true })) || (fallback ? caches.match(fallback) : undefined) || Promise.reject(e);
  }
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^twrc-/.test(k) && ![STATIC, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);

  // Confidentialité : aucun fournisseur externe (et donc aucune coordonnée GPS envoyée dans ses URL) n'est persisté par le SW.
  if (u.origin !== self.location.origin) return;

  // Agenda = blob AES-GCM chiffré ; obs/tiredb/version = données publiques. Une seule copie canonique, sans le ?t=.
  if (DATA_PATHS.test(u.pathname)) {
    e.respondWith(networkFirst(e.request, DATA, canonical(u)));
    return;
  }

  // Navigation / shell : dernière version réseau, shell préchargé en secours.
  const isNav = e.request.mode === 'navigate' || /\.html?$|\/$/.test(u.pathname);
  e.respondWith(networkFirst(e.request, STATIC, isNav ? new Request(new URL('index.html', self.registration.scope).href) : e.request, './index.html', e, isNav ? NAV_WAIT_MS : 0));
});
// Diagnostic (Réglages → Diagnostic) : versions des caches du SW actif.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'twrc-version' && e.ports && e.ports[0]) e.ports[0].postMessage({ static: STATIC, data: DATA });
});
