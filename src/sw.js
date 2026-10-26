// Tyre Weather Race Control : shell PWA hors ligne + dernières données publiques chiffrées
// Les requêtes vers OSRM, Open-Meteo, BigDataCloud, RainViewer et les tuiles externes ne sont JAMAIS mises en Cache Storage.
const STATIC = 'twrc-static-v12', DATA = 'twrc-data-v3';
const NAV_WAIT_MS = 3000;   // réseau qui ne répond pas (parking, tunnel) : shell en cache au-delà, mise à jour poursuivie en arrière-plan
const SHELL = ['./', './index.html', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './manifest.webmanifest', './tiredb.json', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png', './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-icon-2x.png', './vendor/leaflet/images/marker-shadow.png'];
const DATA_PATHS = /\/(calendar\.sealed\.json|obs\.json|tiredb\.json|version\.json|road-datex\.json)$/;
// Origine dédiée : les données publiques du relais restent publiées par l'ancien hébergement (CORS).
// Valeur injectée par tools/build.js depuis RC_DATA_BASE ; vide sur l'hébergement historique.
const DATA_BASE = '';
const RELAY_DATA = /^(calendar\.sealed\.json|obs\.json|road-datex\.json)$/;

const canonical = u => new Request(u.origin + u.pathname, { method: 'GET' });
function roadMetadataValid(j) {
  const now = Date.now(), validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 60000;
  return !!j && j.schema === 1 && j.provider === 'datex' && j.complete === true &&
    Array.isArray(j.events) && j.events.length <= 2500 && typeof j.coverage === 'string' && !!j.coverage.trim() &&
    (j.flows == null || Array.isArray(j.flows) && j.flows.length <= 2500) && validTime(j.checkedAt) && validTime(j.publicationTime);
}
async function roadFallback(response) {
  if (!response) throw new Error('Road cache unavailable');
  const headers = new Headers(response.headers); headers.set('X-TWRC-Cache', 'fallback');
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
}
async function roadCached(cache, key) {
  if (!cache) return null;
  try {
    const old = await cache.match(key); if (!old) return null;
    const j = await old.clone().json(), a = Date.parse(j.checkedAt), b = Date.parse(j.publicationTime), now = Date.now();
    if (!roadMetadataValid(j) || Math.max(now - a, now - b) > 86400000) throw new Error('expired');
    return old;
  } catch (e) { try { await cache.delete(key); } catch (ignored) {} return null; }
}
async function publicRoad(req, key) {
  let cache = null; try { cache = await caches.open(DATA); } catch (e) { /* cache refusé : réseau seul */ }
  try {
    const response = await fetch(req, { cache: 'no-store' });
    if (response.ok) {
      // Seul DATEX public est stockable. Une réponse HTML/JSON invalide ne remplace jamais le dernier flux valide.
      const raw = await response.clone().text();
      if (cache && raw.length <= 1500000) {
        try { if (roadMetadataValid(JSON.parse(raw))) await cache.put(key, response.clone()); } catch (e) { /* non stockable */ }
      }
      return response;
    }
    const old = await roadCached(cache, key); return old ? roadFallback(old) : response;
  } catch (error) {
    const old = await roadCached(cache, key);
    if (old) return roadFallback(old);
    throw error;
  }
}
async function networkFirst(req, cacheName, key, fallback, event, waitMs, validate = () => true) {
  const cache = await caches.open(cacheName), k = key || req;
  const valid = response => !!response && response.ok && validate(response);
  const cached = async () => {
    let response = await cache.match(k, { ignoreSearch: true });
    if (valid(response)) return response;
    response = fallback ? await caches.match(fallback) : null;
    return valid(response) ? response : null;
  };
  if (waitMs) {
    const old = await cached();
    if (old) {
      const net = fetch(req, { cache: 'no-store' }).then(async r => { if (valid(r)) await cache.put(k, r.clone()); return r; });
      if (event) event.waitUntil(net.catch(() => null));
      const r = await Promise.race([net.catch(() => null), new Promise(res => setTimeout(() => res(null), waitMs))]);
      return valid(r) ? r : old;
    }
  }
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (valid(r)) { await cache.put(k, r.clone()); return r; }
    // GitHub Pages/CDN peut répondre 5xx sans être techniquement « hors réseau » :
    // dans ce cas on préfère la dernière copie valide plutôt qu'une panne visible.
    const old = await cached();
    return old || r;
  } catch (e) {
    return (await cached()) || Promise.reject(e);
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

  // Seuls les trois fichiers publics du relais, directement sous DATA_BASE, sont mis en cache hors de l'origine.
  if (DATA_BASE && u.href.startsWith(DATA_BASE) && u.origin === new URL(DATA_BASE).origin && RELAY_DATA.test(u.pathname.slice(new URL(DATA_BASE).pathname.length))) {
    e.respondWith(/\/road-datex\.json$/.test(u.pathname) ? publicRoad(e.request, canonical(u)) : networkFirst(e.request, DATA, canonical(u)));
    return;
  }
  // Confidentialité : aucun fournisseur externe (et donc aucune coordonnée GPS envoyée dans ses URL) n'est persisté par le SW.
  if (u.origin !== self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // La page de récupération ne doit jamais remplacer index.html dans le cache
  // du shell. Son réseau/version doivent être confirmés, sans fallback métier.
  if (/\/recovery\.html$/.test(u.pathname)) return;

  if (/\/road-datex\.json$/.test(u.pathname)) { e.respondWith(publicRoad(e.request, canonical(u))); return; }
  // Les futurs bridges commerciaux devront être explicitement autorisés : aucun cache implicite du shell.
  if (/\/road-[^/]+|\/api\/road\//.test(u.pathname)) { e.respondWith(fetch(e.request)); return; }

  // Agenda = blob AES-GCM chiffré ; obs/tiredb/version = données publiques. Une seule copie canonique, sans le ?t=.
  if (DATA_PATHS.test(u.pathname)) {
    e.respondWith(networkFirst(e.request, DATA, canonical(u)));
    return;
  }

  const scope = new URL(self.registration.scope), path = u.pathname.slice(scope.pathname.length);
  // Ces pages/configurations doivent aller directement au réseau. CacheStorage.put
  // n'honore pas Cache-Control: no-store lorsqu'on le remplit explicitement.
  if (['recovery', 'recovery.html', 'drive-config.json', 'fixture-manifest.json'].includes(path)) return;

  // Seuls les alias explicites de l'application peuvent utiliser le shell en secours.
  // Une navigation vers un JSON ou une page annexe ne doit jamais écraser index.html.
  if (e.request.mode === 'navigate') {
    if (![scope.pathname, new URL('index', scope).pathname, new URL('index.html', scope).pathname].includes(u.pathname)) return;
    const shell = new URL('index.html', scope);
    const html = response => /^text\/html(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '');
    e.respondWith(networkFirst(e.request, STATIC, new Request(shell.href), './index.html', e, NAV_WAIT_MS, html));
    return;
  }

  // Les autres ressources peuvent retrouver leur propre URL en cache, jamais le shell.
  e.respondWith(networkFirst(e.request, STATIC, e.request));
});
// Diagnostic (Réglages → Diagnostic) : versions des caches du SW actif.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'twrc-version' && e.ports && e.ports[0]) e.ports[0].postMessage({ static: STATIC, data: DATA });
});
