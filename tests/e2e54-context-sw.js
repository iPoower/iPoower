// Vrai Service Worker : migration v10 → v11, ancien profil, cache, fermeture et
// réouverture hors ligne. App complète ; données et lieux exclusivement fictifs.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm'), assert = require('node:assert/strict'), pw = require('playwright');
const SITE = path.resolve('site'), T = Date.parse('2026-10-05T06:50:00+02:00');
const ctx = { Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }, Math, Intl, Map, Set, JSON };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;', ctx);
let version = 10, n = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost'), rel = u.pathname.replace(/^\/race-control\//, '') || 'index.html', file = path.join(SITE, rel);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('fixture absente'); }
  const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : /\.(json|webmanifest)$/.test(file) ? 'application/json' : 'text/html';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
  if (rel === 'sw.js') return res.end(fs.readFileSync(file, 'utf8').replace('twrc-static-v11', 'twrc-static-v' + version));
  fs.createReadStream(file).pipe(res);
});
async function check(label, fn) { await fn(); n++; console.log('✅ ' + label); }
const read = p => p.evaluate(() => ({ state: APP_CONTEXT.snapshot.status, place: APP_CONTEXT.snapshot.currentLocation && APP_CONTEXT.snapshot.currentLocation.id,
  origin: APP_CONTEXT.snapshot.origin && APP_CONTEXT.snapshot.origin.id, dir: APP_CONTEXT.snapshot.activeTrip && APP_CONTEXT.snapshot.activeTrip.td.dir,
  next: APP_CONTEXT.snapshot.nextTrip && APP_CONTEXT.snapshot.nextTrip.td.dir, stored: JSON.parse(localStorage.getItem(USER_STORE.key)), caches: [] }));
async function views(p, expected) {
  for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
    await p.locator('[data-act=view][data-v=' + view + ']').click(); const s = await read(p);
    for (const [k, v] of Object.entries(expected)) assert.equal(s[k], v, view + ' · ' + JSON.stringify(s));
    if (view === 'tenue' && expected.state !== 'travel') {
      const first = await p.locator('#secTenue .outfit-moment:first-child .outfit-moment-heading').innerText();
      assert(first.includes(expected.place === 'work' ? 'Lieu de travail' : 'Lieu principal')); assert(!first.includes('→'), first);
    }
  }
}
(async () => {
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port))), base = 'http://localhost:' + port + '/race-control/';
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await pw.chromium.launch({ ...(fs.existsSync(local) ? { executablePath: local } : {}), args: ['--no-sandbox'], proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost' } });
  try {
    const c = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris' }), errors = [];
    await c.route('**/*', r => {
      const u = r.request().url(); if (u.startsWith(base)) return r.continue();
      if (u.includes('open-meteo.com')) {
        const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
        const one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(lats.length > 1 ? lats.map((_, i) => one(i)) : one(0)) });
      }
      return r.abort();
    });
    await c.addInitScript(({ time }) => {
      localStorage.setItem('twrc.nocode', '1');
      if (!localStorage.getItem('twrc.context.v1')) {
        localStorage.setItem('twrc.place.v1', JSON.stringify({ conf: { placeId: 'work', at: time, how: 'manual', day: '2026-10-05' }, last: { placeId: 'work', at: time, source: 'manual' } }));
        localStorage.setItem('twrc.tripdone', JSON.stringify({ 'commute|2026-10-05T07:30|go': { how: 'confirmé', at: time, exp: time + 86400000 } }));
      }
    }, { time: T });
    let p;
    const open = async () => {
      p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: T }); await p.goto(base);
      for (let i = 0; i < 12; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); }
    };
    await open();
    await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
    await p.reload(); await p.waitForFunction(() => navigator.serviceWorker.controller);
    await check('ancien profil v10 : confirmation au travail migrée dans les quatre vues', () => views(p, { state: 'work', place: 'work', next: 'ret' }));
    const before = (await read(p)).stored;
    version = 11; await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await p.waitForFunction(async () => { const keys = await caches.keys(); return keys.includes('twrc-static-v11') && !keys.includes('twrc-static-v10'); });
    await check('migration v11 : contexte conservé et cache v10 supprimé, aucune donnée externe dans Cache Storage', async () => {
      assert.deepEqual((await read(p)).stored, before);
      const urls = await p.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat());
      assert(urls.every(u => u.startsWith(base))); assert(!urls.some(u => /latitude=|longitude=/.test(u)));
    });
    await c.setOffline(true); await p.close(); await open();
    await check('PWA fermée/réouverte hors ligne : toujours au travail, aucun aller dans Tenue', () => views(p, { state: 'work', place: 'work', next: 'ret' }));
    await p.locator('#placeBar [data-act=place-leave]').click();
    await check('retour anticipé hors ligne : quatre vues en déplacement depuis le travail', () => views(p, { state: 'travel', origin: 'work', dir: 'ret' }));
    const startKey = (await read(p)).stored.tripStart.key;
    await p.close(); await open();
    await check('PWA fermée pendant le retour : même départ et même trajet restaurés', async () => { assert.equal((await read(p)).stored.tripStart.key, startKey); await views(p, { state: 'travel', origin: 'work', dir: 'ret' }); });
    await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click();
    await p.close(); await open();
    await check('arrivée maison puis réouverture hors ligne : lieu et deux trajets clôturés persistants', async () => {
      await views(p, { state: 'home', place: 'home', next: 'go' }); assert.equal((await read(p)).stored.tripStart, null); assert(Object.keys((await read(p)).stored.done).includes(startKey));
    });
    await check('vrai SW et application : aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    await c.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
