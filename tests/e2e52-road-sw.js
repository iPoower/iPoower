// Service Worker réel : migration v9 → v10, cache DATEX autorisé, provenance du secours et confidentialité.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), pw = require('playwright'), F = require('./lib/road-fixtures');
const SITE = path.resolve('site'), ROOT = path.resolve(__dirname, '..'), T = Date.now();
const feed = F.feed('datex', { checkedAt: new Date(T).toISOString(), publicationTime: new Date(T - 30000).toISOString(), events: [F.event({ updatedAt: new Date(T - 30000).toISOString(), startTime: new Date(T - 3600000).toISOString(), endTime: new Date(T + 3600000).toISOString() })] });
let mode = 'ok', n = 0;
const check = (label, ok) => { assert(ok, label); n++; console.log('✅ ' + label); };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/race-control/harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><title>SW fictif</title>'); }
  if (u.pathname.endsWith('/road-datex.json')) { res.writeHead(mode === '503' ? 503 : 200, { 'content-type': mode === 'invalid' ? 'text/html' : 'application/json' }); return res.end(mode === 'invalid' ? '<html>panne</html>' : JSON.stringify(feed)); }
  const file = path.join(SITE, u.pathname.replace(/^\/race-control\//, ''));
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.json') || file.endsWith('.webmanifest') ? 'application/json' : 'text/html' }); fs.createReadStream(file).pipe(res);
});
(async () => {
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port))), base = 'http://localhost:' + port + '/race-control/';
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await pw.chromium.launch({ ...(fs.existsSync(local) ? { executablePath: local } : {}), args: ['--no-sandbox'], proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost' } });
  try {
    const c = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 414, height: 896 } }), p = await c.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message)); await p.goto(base + 'harness.html');
    await p.evaluate(async () => { const old = await caches.open('twrc-static-v9'); await old.put('index.html', new Response('ancien shell')); const data = await caches.open('twrc-data-v3'); await data.put('obs.json', new Response('{"public":true}')); });
    await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })); });
    const keys = await p.evaluate(() => caches.keys()); check('migration : v10 actif, v9 purgé, données publiques v3 conservées', keys.includes('twrc-static-v10') && !keys.includes('twrc-static-v9') && keys.includes('twrc-data-v3'));
    const read = () => p.evaluate(async () => { const r = await fetch('road-datex.json'); return { status: r.status, cache: r.headers.get('x-twrc-cache'), body: await r.text() }; });
    let r = await read(); check('200 DATEX validé et mis en cache, sans marqueur de secours', r.status === 200 && r.cache === null && JSON.parse(r.body).provider === 'datex');
    await p.evaluate(() => fetch('road-datex.json?t=fictif'));
    const dataKeys = await p.evaluate(async () => (await (await caches.open('twrc-data-v3')).keys()).map(r => r.url)); check('une seule clé canonique DATEX, aucune position ou query persistée', dataKeys.filter(u => u.includes('road-datex')).length === 1 && dataKeys.filter(u => u.includes('road-datex')).every(u => !u.includes('?')));
    mode = 'invalid'; await read(); const kept = await p.evaluate(async () => (await (await caches.open('twrc-data-v3')).match('road-datex.json')).json()); check('200 HTML invalide ne remplace pas le dernier flux DATEX valide', kept.provider === 'datex');
    mode = '503'; r = await read(); check('503 : cache de secours explicitement marqué', r.status === 200 && r.cache === 'fallback');
    await p.addScriptTag({ path: path.join(ROOT, 'src/road-intelligence.js') }); await p.addScriptTag({ path: path.join(ROOT, 'src/road-providers.js') });
    const fresh = await p.evaluate(async ({ route, fix, time }) => { const m = new RoadProviders.Manager({ providers: [new RoadProviders.DatexRoadProvider(fetch.bind(window))], now: () => time }); m.setContext({ key: 'fictif', phase: 'active', route: RoadIntelligence.fromOSRM(route), fix: { ...fix, ts: time } }); await m.refresh(); return { fresh: m.snapshot().fresh, state: m.snapshot().providers[0].state, alert: m.nextAlert() }; }, { route: F.routeJSON, fix: F.fix, time: T });
    check('vrai SW + Manager : une copie fraîche de secours ne devient jamais LIVE', !fresh.fresh && fresh.state === 'cached' && fresh.alert === null);
    await c.setOffline(true); r = await read(); check('hors ligne : secours daté marqué et shell disponible', r.cache === 'fallback' && r.status === 200);
    await c.setOffline(false);
    await p.evaluate(() => fetch('road-paid.json?latitude=48.8502&key=fictif'));
    const all = await p.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat());
    check('futur fournisseur commercial : aucun stockage implicite de clé ou coordonnée', !all.some(u => /road-paid|latitude=|key=/.test(u)));
    await p.evaluate(async ({ old }) => { const cache = await caches.open('twrc-data-v3'); await cache.put('road-datex.json', new Response(JSON.stringify(old), { headers: { 'content-type': 'application/json' } })); }, { old: { ...feed, checkedAt: new Date(T - 25 * 3600000).toISOString(), publicationTime: new Date(T - 25 * 3600000).toISOString() } });
    r = await read(); check('rétention 24 h : vieux cache purgé même en panne HTTP 503', r.status === 503 && await p.evaluate(async () => !(await (await caches.open('twrc-data-v3')).match('road-datex.json'))));
    check('service worker : aucune erreur JavaScript', errors.length === 0); await c.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
