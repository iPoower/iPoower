// Tyre Weather Race Control : shell PWA hors ligne + dernières données publiques chiffrées
// Les requêtes vers OSRM, Open-Meteo, BigDataCloud, RainViewer et les tuiles externes ne sont JAMAIS mises en Cache Storage.
const STATIC = 'twrc-static-v7', DATA = 'twrc-data-v3';
const SHELL = ['./', './index.html', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './manifest.webmanifest', './tiredb.json'];
const DATA_PATHS = /\/(calendar\.sealed\.json|obs\.json|tiredb\.json|version\.json)$/;

const canonical = u => new Request(u.origin + u.pathname, { method: 'GET' });
async function networkFirst(req, cacheName, key, fallback) {
  const cache = await caches.open(cacheName), k = key || req;
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
  e.respondWith(networkFirst(e.request, STATIC, isNav ? new Request(new URL('index.html', self.registration.scope).href) : e.request, './index.html'));
});
