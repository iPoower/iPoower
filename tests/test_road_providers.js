'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), Road = require('../src/road-intelligence'), P = require('../src/road-providers'), F = require('./lib/road-fixtures');
let n = 0, now = F.NOW; const check = async (label, fn) => { now = F.NOW; await fn(); n++; console.log('✅ ' + label); };
const response = (j = F.feed(), status = 200, headers = {}) => new Response(JSON.stringify(j), { status, headers });
const context = { key: 'trip-fictif', phase: 'active', route: Road.fromOSRM(F.routeJSON), fix: F.fix };
const manager = (providers, options = {}) => { const m = new P.Manager({ providers, now: () => now, ...options }); m.setContext(context); return m; };
const provider = (load, extra = {}) => new P.RoadProvider({ id: 'datex', label: 'Fictif', load, ...extra });
function sw({ denied = false, quota = false, offline = false, status = 200, old = null } = {}) {
  const url = 'https://example.test/race-control/road-datex.json', stored = new Map(old ? [[url, response(old)]] : []), handlers = {};
  const cache = { match: async k => stored.get(k.url || k)?.clone(), delete: async k => stored.delete(k.url || k), put: async (k, r) => { if (quota) throw new Error('quota'); stored.set(k.url || k, r.clone()); } };
  const context = vm.createContext({ URL, Request, Response, Headers, Promise, setTimeout, Date: class extends Date { static now() { return F.NOW; } },
    caches: { open: async () => { if (denied) throw new Error('denied'); return cache; } }, fetch: async () => { if (offline) throw new Error('offline'); return response(F.feed(), status); },
    self: { location: { origin: 'https://example.test' }, registration: { scope: 'https://example.test/race-control/' }, addEventListener: (type, fn) => { handlers[type] = fn; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/sw.js'), 'utf8'), context);
  return { stored, read: async () => { let pending; handlers.fetch({ request: new Request(url), respondWith: r => { pending = r; } }); return pending; } };
}
(async () => {
await check('DATEX ne transmet aucune position, itinéraire, clé ou referrer', async () => {
  let call; const m = manager([new P.DatexRoadProvider((...args) => { call = args; return response(); })]);
  await m.refresh(); assert.equal(call[0], 'road-datex.json'); assert.equal(call[1].credentials, 'omit'); assert.equal(call[1].referrerPolicy, 'no-referrer');
  const s = m.snapshot(); assert(s.fresh); assert.equal(s.events.length, 1); assert(m.nextAlert()); assert.equal(m.nextAlert(), null);
});
await check('200 vide valide distingue aucun signalement de fournisseur indisponible', async () => {
  const m = manager([provider(() => response(F.feed('datex', { events: [] })))]); await m.refresh(); assert(m.snapshot().fresh); assert.equal(m.snapshot().events.length, 0);
});
await check('401, 403, 429, 5xx, réponse corrompue : pannes isolées, aucun faux LIVE', async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const m = manager([provider(() => response({}, status, { 'retry-after': '900' }))]); await m.refresh();
    assert.equal(m.states.get('datex').state, status === 429 ? 'limited' : status < 429 ? 'unauthorized' : 'unavailable'); assert(!m.snapshot().fresh); assert.equal(m.snapshot().events.length, 0);
    if (status === 429) assert(m.states.get('datex').retryAt >= now + 900000);
  }
  for (const load of [() => new Response('<html>panne</html>'), () => response({}), () => response(F.feed('datex', { complete: false })), () => { throw null; }]) {
    const m = manager([provider(load)]); await m.refresh(); assert.equal(m.states.get('datex').state, 'unavailable');
  }
});
await check('fournisseur bloqué, corps muet et fournisseur rapide : délai borné, aucune panne commune', async () => {
  const m = manager([provider(() => new Promise(() => {}), { timeoutMs: 10 }), provider(() => response(F.feed('fast')), { id: 'fast' })]);
  await m.refresh(); assert.equal(m.states.get('datex').state, 'timeout'); assert.equal(m.states.get('fast').state, 'ready'); assert(m.snapshot().fresh);
  const body = manager([provider(() => ({ ok: true, text: () => new Promise(() => {}) }), { timeoutMs: 10 })]); await body.refresh(); assert.equal(body.states.get('datex').state, 'timeout');
});
await check('hors ligne, sans trajet, caché ou désactivé : aucune requête', async () => {
  let count = 0; const m = manager([provider(() => { count++; return response(); })]);
  await m.refresh({ online: false }); await m.refresh({ visible: false }); m.setEnabled('datex', false); await m.refresh(); m.setContext(null); await m.refresh(); assert.equal(count, 0);
});
await check('réponse ancienne après changement de trajet, arrêt ou suspension rejetée', async () => {
  for (const act of [m => m.setContext({ ...context, key: 'nouveau' }), m => m.stop(), m => m.suspend(), m => m.setEnabled('datex', false)]) {
    let resolve; const m = manager([provider(() => new Promise(r => { resolve = r; }))]); const pending = m.refresh(); await Promise.resolve(); act(m); resolve(response()); await pending;
    assert.equal(m.states.get('datex').feed, null); assert(!m.snapshot().fresh);
  }
});
await check('cache public licite : pas de GPS persisté ; hors ligne et SW fallback jamais LIVE', async () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const m = manager([provider(() => response(), { cacheAllowed: true })], { storage }); await m.refresh();
  assert.equal(values.size, 1); const saved = JSON.parse(values.get('twrc.road.datex')); assert(!saved.fix && !saved.route && !saved.distanceAhead); assert(!JSON.stringify(saved).includes('trip-fictif'));
  const loaded = manager([provider(() => response(), { cacheAllowed: true })], { storage }); assert(!loaded.snapshot().fresh); assert.equal(loaded.snapshot({ online: false }).events.length, 1); assert.equal(loaded.nextAlert({ online: false }), null);
  const fallback = manager([provider(() => response(F.feed(), 200, { 'x-twrc-cache': 'fallback' }), { cacheAllowed: true })]); await fallback.refresh(); assert(!fallback.snapshot().fresh); assert.equal(fallback.states.get('datex').state, 'cached');
  now += 24 * 3600000 + 1; loaded.snapshot(); assert.equal(values.size, 0);
});
await check('cache interdit pour un fournisseur commercial ; cache et quota refusés sans casser le module', async () => {
  const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  const m = manager([provider(() => response(), { cacheAllowed: true })], { storage }); await m.refresh(); assert(m.snapshot().fresh);
  let wrote = false; const commercial = manager([provider(() => response(F.feed('paid')), { id: 'paid' })], { storage: { getItem: () => null, setItem: () => { wrote = true; } } }); await commercial.refresh(); assert(!wrote);
});
await check('âge et expiration : récent sans LIVE après 2 min ; masqué après 12 min', async () => {
  const m = manager([provider(() => response(), { cacheAllowed: true })]); await m.refresh(); now += 150000; assert(!m.snapshot().fresh); assert(m.snapshot().providers[0].confirmed); assert.equal(m.nextAlert(), null);
  now += 720000; assert.equal(m.snapshot().events.length, 0); assert.equal(m.snapshot().providers[0].state, 'stale');
});
await check('retries et circuit temporisés, cadence sans rafale, nouveau fournisseur indépendant', async () => {
  let calls = 0; const m = manager([provider(() => { calls++; return response({}, 503); })]);
  await m.refresh(); await m.refresh(); assert.equal(calls, 1);
  for (let i = 0; i < 2; i++) { now = m.states.get('datex').retryAt; await m.refresh(); }
  assert.equal(calls, 3); assert(m.states.get('datex').retryAt - now >= 600000);
});
await check('flux de vitesse séparé, jamais accident déduit ni ETA trafic appliquée', async () => {
  const m = manager([provider(() => response(F.feed('datex', { events: [], flows: [F.event({ sourceId: 'flow', currentSpeed: 5, freeFlowSpeed: 90, type: 'accident' })] })))]); await m.refresh();
  const s = m.snapshot(); assert.equal(s.events.length, 0); assert.equal(s.flows.length, 1); assert.equal(s.flows[0].type, 'unknown'); assert.equal(m.nextAlert(), null);
});
await check('GPS incertain, dérive, reroute, arrivée et annulation suppriment les alertes', async () => {
  const m = manager([provider(() => response())]); await m.refresh(); m.setContext({ ...context, fix: { ...F.fix, acc: 500 } }); assert.equal(m.snapshot().events.length, 0);
  m.setContext({ ...context, fix: { ...F.fix, lon: 3 } }); assert.equal(m.snapshot().reason, 'off_route');
  m.setContext({ ...context, route: Road.fromOSRM({ routes: [{ ...F.routeJSON.routes[0], legs: [{ steps: [{ ref: 'D2', geometry: { coordinates: F.coordinates } }] }] }] }) }); assert.equal(m.snapshot().events.length, 0);
  m.stop(); assert.equal(m.snapshot().events.length, 0); assert.equal(m.nextAlert(), null);
});
await check('SW : Cache Storage refusé ou quota plein ne perd pas une réponse réseau valide', async () => {
  for (const options of [{ denied: true }, { quota: true }]) { const r = await sw(options).read(); assert.equal(r.status, 200); assert.equal(r.headers.get('x-twrc-cache'), null); assert.equal((await r.json()).provider, 'datex'); }
});
await check('SW : secours après offline/503 marqué ; cache de plus de 24 h purgé', async () => {
  for (const options of [{ offline: true }, { status: 503 }]) { const s = sw({ ...options, old: F.feed() }), r = await s.read(); assert.equal(r.headers.get('x-twrc-cache'), 'fallback'); }
  const s = sw({ status: 503, old: F.feed('datex', { checkedAt: new Date(F.NOW - 25 * 3600000).toISOString() }) }); assert.equal((await s.read()).status, 503); assert.equal(s.stored.size, 0);
});
await check('SW : aucun cache disponible hors réseau ne crée de contenu LIVE', async () => {
  await assert.rejects(sw({ denied: true, offline: true }).read());
});
console.log(`${n}/${n} scénarios OK`);
})().catch(e => { console.error(e); process.exit(1); });
