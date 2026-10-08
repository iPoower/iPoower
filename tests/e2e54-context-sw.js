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
  origin: APP_CONTEXT.snapshot.origin && APP_CONTEXT.snapshot.origin.id, dir: APP_CONTEXT.snapshot.activeTrip && APP_CONTEXT.snapshot.activeTrip.td && APP_CONTEXT.snapshot.activeTrip.td.dir,
  next: APP_CONTEXT.snapshot.nextTrip && APP_CONTEXT.snapshot.nextTrip.td && APP_CONTEXT.snapshot.nextTrip.td.dir,
  destination: APP_CONTEXT.snapshot.destination && APP_CONTEXT.snapshot.destination.id, car: APP_CONTEXT.snapshot.activeCarId,
  stored: JSON.parse(localStorage.getItem(USER_STORE.key)), caches: [] }));
async function destination(p, id) {
  if (await p.evaluate(() => UI.view === 'analyse')) await p.locator('#viewSeg [data-act=view][data-v=pneus]').click();
  if (!(await p.locator('#dayContext .day-editor').getAttribute('open') != null)) await p.locator('#dayContext .day-editor > summary').tap();
  if (!(await p.locator('#dayContext .day-destination').getAttribute('open') != null)) await p.locator('#dayContext .day-destination > summary').tap();
  await p.locator('#dayContext [data-act=day-destination][data-id=' + id + ']').tap();
}
async function views(p, expected) {
  for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
    await p.locator('#viewSeg [data-act=view][data-v=' + view + ']').click(); const s = await read(p);
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
    const c = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris' }), errors = [];
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
    const open = async (at = T) => {
      p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: at }); await p.goto(base);
      for (let i = 0; i < 12; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); }
    };
    const reopen = async () => { const at = await p.evaluate(() => Date.now()); await p.close(); await open(at); };
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
    // Lieux et véhicules fictifs uniquement ; choix de contexte par vrais taps.
    await p.evaluate(() => { S.customs = [{ id: 'b', name: 'Lieu B', lat: 48.8, lon: 2.45 }]; const car = structuredClone(S.cars[0]); car.id = 'carB'; car.name = car.short = 'Voiture B'; S.cars[1] = car; saveSettings(); renderAll(); });
    await destination(p, 'b'); await p.locator('#dayContext [data-act=day-car][data-id=carB]').tap(); await p.locator('#dayContext [data-act=day-type][data-v=work]').tap();
    await c.setOffline(true); await reopen();
    await check('PWA fermée/réouverte hors ligne : Lieu B et voiture B, aucun aller dans Tenue', async () => {
      await views(p, { state: 'work', place: 'work', next: 'ret', destination: 'b', car: 'carB' });
      assert.equal((await read(p)).stored.dayContext.dayType.value, 'work');
    });
    await destination(p, 'home');
    await p.locator('#placeBar [data-act=place-leave]').click();
    await check('retour anticipé hors ligne : quatre vues en déplacement depuis le travail', () => views(p, { state: 'travel', origin: 'work', dir: 'ret' }));
    const startKey = (await read(p)).stored.tripStart.key;
    await reopen();
    await check('PWA fermée pendant le retour : même départ et même trajet restaurés', async () => { assert.equal((await read(p)).stored.tripStart.key, startKey); await views(p, { state: 'travel', origin: 'work', dir: 'ret' }); });
    await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click();
    await p.locator('#secDebrief [data-act=debrief-condition][data-v=fog]').tap();
    await p.locator('#secDebrief [data-act=debrief-save]').tap();
    await reopen();
    await check('arrivée maison puis réouverture hors ligne : lieu et deux trajets clôturés persistants', async () => {
      await views(p, { state: 'home', place: 'home', next: 'go' }); assert.equal((await read(p)).stored.tripStart, null); assert(Object.keys((await read(p)).stored.done).includes(startKey));
    });
    await check('débrief puis fermeture PWA hors ligne : observation et snapshot conservés une seule fois', async () => {
      const rows = (await read(p)).stored.debrief.entries; assert.equal(rows.length, 1); assert.equal(rows[0].key, startKey);
      assert.deepEqual(rows[0].feedback.conditions, ['fog']); assert(rows[0].start);
      for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) { await p.locator('#viewSeg [data-act=view][data-v=' + view + ']').click(); assert(await p.locator('#secDebrief').isVisible()); }
    });
    await check('ancienne page réécrivant v1 : le journal reste récupérable hors ligne', async () => {
      await p.evaluate(() => { const old = JSON.parse(localStorage.getItem('twrc.context.v1')); delete old.debrief; localStorage.setItem('twrc.context.v1', JSON.stringify(old)); });
      await reopen(); const rows = (await read(p)).stored.debrief.entries; assert.equal(rows.length, 1); assert.deepEqual(rows[0].feedback.conditions, ['fog']);
    });
    await check('vrai SW et application : aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    await c.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
